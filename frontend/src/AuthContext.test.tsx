import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./AuthContext";
import type { AuthResponse, User } from "./types";

vi.mock("./api", () => ({
  refreshAccessToken: vi.fn(),
  logoutUser: vi.fn(),
}));

import { logoutUser, refreshAccessToken } from "./api";

const ACCESS_TOKEN_KEY = "ai_loadboard_token";
const REFRESH_TOKEN_KEY = "ai_loadboard_refresh_token";

const FAKE_USER: User = {
  id: 1,
  email: "carrier@example.com",
  company_name: "Test Carrier Co",
  role: "carrier",
};

function fakeAuthResponse(overrides: Partial<AuthResponse> = {}): AuthResponse {
  return {
    access_token: "fake-access-token",
    refresh_token: "fake-refresh-token",
    token_type: "bearer",
    user: FAKE_USER,
    ...overrides,
  };
}

/** Renders whatever useAuth() currently holds as text nodes, so assertions
can read state without reaching into React internals. */
function Consumer() {
  const { user, token, loading } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="user">{user ? user.email : "none"}</span>
      <span data-testid="token">{token ?? "none"}</span>
    </div>
  );
}

function LogoutButton() {
  const { logout } = useAuth();
  return <button onClick={logout}>Log out</button>;
}

function renderWithProvider(children: React.ReactNode) {
  return render(<AuthProvider>{children}</AuthProvider>);
}

async function waitForBootstrap() {
  await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));
}

beforeEach(() => {
  localStorage.clear();
  vi.mocked(refreshAccessToken).mockReset();
  vi.mocked(logoutUser).mockReset();
});

afterEach(() => {
  localStorage.clear();
});

describe("AuthProvider bootstrap", () => {
  it("stays logged out when there's no stored refresh token", async () => {
    renderWithProvider(<Consumer />);

    await waitForBootstrap();
    expect(screen.getByTestId("user")).toHaveTextContent("none");
    expect(screen.getByTestId("token")).toHaveTextContent("none");
    expect(refreshAccessToken).not.toHaveBeenCalled();
  });

  it("logs in by exchanging a stored refresh token — no separate /me call needed", async () => {
    localStorage.setItem(REFRESH_TOKEN_KEY, "stored-refresh-token");
    vi.mocked(refreshAccessToken).mockResolvedValue(fakeAuthResponse());

    renderWithProvider(<Consumer />);

    await waitForBootstrap();
    expect(refreshAccessToken).toHaveBeenCalledWith("stored-refresh-token");
    expect(screen.getByTestId("user")).toHaveTextContent(FAKE_USER.email);
    expect(screen.getByTestId("token")).toHaveTextContent("fake-access-token");
    expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBe("fake-access-token");
    expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBe("fake-refresh-token");
  });

  it("clears everything and renders logged-out when the stored token is dead", async () => {
    localStorage.setItem(REFRESH_TOKEN_KEY, "a-dead-token");
    localStorage.setItem(ACCESS_TOKEN_KEY, "stale-access-token");
    vi.mocked(refreshAccessToken).mockRejectedValue(new Error("Session refresh failed"));

    renderWithProvider(<Consumer />);

    await waitForBootstrap();
    expect(screen.getByTestId("user")).toHaveTextContent("none");
    expect(screen.getByTestId("token")).toHaveTextContent("none");
    expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBeNull();
  });
});

describe("logout", () => {
  it("revokes the refresh token server-side and clears local state", async () => {
    localStorage.setItem(REFRESH_TOKEN_KEY, "stored-refresh-token");
    vi.mocked(refreshAccessToken).mockResolvedValue(fakeAuthResponse());
    vi.mocked(logoutUser).mockResolvedValue(undefined);

    const user = userEvent.setup();
    renderWithProvider(
      <>
        <Consumer />
        <LogoutButton />
      </>,
    );
    await waitForBootstrap();
    expect(screen.getByTestId("user")).toHaveTextContent(FAKE_USER.email);

    await user.click(screen.getByRole("button", { name: "Log out" }));

    expect(logoutUser).toHaveBeenCalledWith("fake-refresh-token");
    expect(screen.getByTestId("user")).toHaveTextContent("none");
    expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBeNull();
  });

  it("still clears local state even if server-side revocation fails", async () => {
    localStorage.setItem(REFRESH_TOKEN_KEY, "stored-refresh-token");
    vi.mocked(refreshAccessToken).mockResolvedValue(fakeAuthResponse());
    vi.mocked(logoutUser).mockRejectedValue(new Error("network error"));

    const user = userEvent.setup();
    renderWithProvider(
      <>
        <Consumer />
        <LogoutButton />
      </>,
    );
    await waitForBootstrap();

    await user.click(screen.getByRole("button", { name: "Log out" }));

    await waitFor(() => expect(screen.getByTestId("user")).toHaveTextContent("none"));
    expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBeNull();
  });

  it("is a no-op server call when there was nothing stored to revoke", async () => {
    const user = userEvent.setup();
    renderWithProvider(<LogoutButton />);

    await user.click(screen.getByRole("button", { name: "Log out" }));

    expect(logoutUser).not.toHaveBeenCalled();
  });
});
