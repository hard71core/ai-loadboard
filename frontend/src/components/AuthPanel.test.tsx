import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthResponse } from "../types";
import AuthPanel from "./AuthPanel";

vi.mock("../api", () => ({
  loginUser: vi.fn(),
  registerUser: vi.fn(),
}));

const mockSetAuth = vi.fn();
vi.mock("../AuthContext", () => ({
  useAuth: () => ({ setAuth: mockSetAuth }),
}));

import { loginUser, registerUser } from "../api";

const FAKE_AUTH: AuthResponse = {
  access_token: "fake-access-token",
  refresh_token: "fake-refresh-token",
  token_type: "bearer",
  user: { id: 1, email: "a@b.com", company_name: "Co", role: "shipper" },
};

// The submit button's text duplicates a tab's text once the panel is in
// that tab's mode ("Log in" while logged-in-tab is active, "Sign up" once
// switched to the register tab) — disambiguate by querying the actual
// <button type="submit"> rather than by accessible name.
function submitButtonOf(container: HTMLElement): HTMLButtonElement {
  return container.querySelector('button[type="submit"]') as HTMLButtonElement;
}

beforeEach(() => {
  vi.mocked(loginUser).mockReset();
  vi.mocked(registerUser).mockReset();
  mockSetAuth.mockReset();
});

describe("AuthPanel — login", () => {
  it("logs in and hands the result straight to setAuth", async () => {
    vi.mocked(loginUser).mockResolvedValue(FAKE_AUTH);
    const onClose = vi.fn();
    const user = userEvent.setup();
    const { container } = render(<AuthPanel onClose={onClose} />);

    await user.type(screen.getByPlaceholderText("you@company.com"), "a@b.com");
    await user.type(screen.getByPlaceholderText("At least 6 characters"), "secret123");
    await user.click(submitButtonOf(container));

    await waitFor(() =>
      expect(loginUser).toHaveBeenCalledWith({ email: "a@b.com", password: "secret123" }),
    );
    expect(mockSetAuth).toHaveBeenCalledWith(FAKE_AUTH);
    expect(onClose).toHaveBeenCalled();
  });

  it("shows the error and leaves the panel open on a failed login", async () => {
    vi.mocked(loginUser).mockRejectedValue(new Error("Invalid email or password"));
    const onClose = vi.fn();
    const user = userEvent.setup();
    const { container } = render(<AuthPanel onClose={onClose} />);

    await user.type(screen.getByPlaceholderText("you@company.com"), "a@b.com");
    await user.type(screen.getByPlaceholderText("At least 6 characters"), "wrong-password");
    await user.click(submitButtonOf(container));

    await waitFor(() =>
      expect(screen.getByText("Invalid email or password")).toBeInTheDocument(),
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(mockSetAuth).not.toHaveBeenCalled();
  });
});

describe("AuthPanel — register", () => {
  it("switches to the register tab and submits company name + role", async () => {
    vi.mocked(registerUser).mockResolvedValue(FAKE_AUTH);
    const onClose = vi.fn();
    const user = userEvent.setup();
    const { container } = render(<AuthPanel onClose={onClose} />);

    // Only one "Sign up" button exists yet (the tab) — the submit button
    // still reads "Log in" until the mode switch below.
    await user.click(screen.getByRole("button", { name: "Sign up" }));

    await user.type(screen.getByPlaceholderText("you@company.com"), "new@co.com");
    await user.type(screen.getByPlaceholderText("At least 6 characters"), "secret123");
    await user.type(screen.getByPlaceholderText("Company name"), "New Co");
    await user.selectOptions(screen.getByRole("combobox"), "carrier");
    await user.click(submitButtonOf(container));

    await waitFor(() =>
      expect(registerUser).toHaveBeenCalledWith({
        email: "new@co.com",
        password: "secret123",
        company_name: "New Co",
        role: "carrier",
      }),
    );
    expect(mockSetAuth).toHaveBeenCalledWith(FAKE_AUTH);
  });

  it("starts in register mode when initialMode is set", () => {
    render(<AuthPanel onClose={vi.fn()} initialMode="register" />);
    expect(screen.getByPlaceholderText("Company name")).toBeInTheDocument();
  });
});
