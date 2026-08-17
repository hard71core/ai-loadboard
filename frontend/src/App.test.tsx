import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import type { User } from "./types";

/** App.tsx is the shell: header/nav/auth-status plus the auth modal and
route wiring. The four routed pages and AuthPanel are mocked out here —
they each carry their own tests (or, for AuthPanel, AuthPanel.test.tsx)
and pull in api.ts/AuthContext dependencies that are out of scope for a
shell test. HomePage's mock exposes its openAuth prop via a button so the
"a page opens the modal itself" path is covered too, not just the
header's own Log in/Sign up buttons. */

const mockLogout = vi.fn();
let mockAuthState: { user: User | null; loading: boolean } = { user: null, loading: false };

vi.mock("./AuthContext", () => ({
  useAuth: () => ({ ...mockAuthState, logout: mockLogout }),
}));

vi.mock("./components/AuthPanel", () => ({
  default: ({
    initialMode,
    onClose,
  }: {
    initialMode: string;
    onClose: () => void;
  }) => (
    <div data-testid="auth-panel">
      <span data-testid="auth-panel-mode">{initialMode}</span>
      <button onClick={onClose}>Close panel</button>
    </div>
  ),
}));

vi.mock("./pages/HomePage", () => ({
  default: ({ openAuth }: { openAuth: (mode: "login" | "register") => void }) => (
    <div>
      Home page
      <button onClick={() => openAuth("register")}>Open signup from home</button>
    </div>
  ),
}));
vi.mock("./pages/LoadsPage", () => ({ default: () => <div>Loads page</div> }));
vi.mock("./pages/LoadDetailPage", () => ({ default: () => <div>Load detail page</div> }));
vi.mock("./pages/DocsPage", () => ({ default: () => <div>Docs page</div> }));

const FAKE_USER: User = {
  id: 1,
  email: "carrier@example.com",
  company_name: "Acme Freight",
  role: "carrier",
};

function renderApp(initialPath = "/") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <App />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockAuthState = { user: null, loading: false };
  mockLogout.mockReset();
});

describe("routing", () => {
  it("renders the home page at /", () => {
    renderApp("/");
    expect(screen.getByText("Home page")).toBeInTheDocument();
  });

  it("renders the loads page at /loads", () => {
    renderApp("/loads");
    expect(screen.getByText("Loads page")).toBeInTheDocument();
  });

  it("renders the load detail page at /loads/:id", () => {
    renderApp("/loads/42");
    expect(screen.getByText("Load detail page")).toBeInTheDocument();
  });

  it("renders the docs page at /docs", () => {
    renderApp("/docs");
    expect(screen.getByText("Docs page")).toBeInTheDocument();
  });
});

describe("nav", () => {
  it("links the brand back to /", () => {
    renderApp("/loads");
    expect(screen.getByRole("link", { name: /LoadBoardGram/ })).toHaveAttribute("href", "/");
  });

  it("marks the current section's link active and leaves the other inactive", () => {
    renderApp("/loads");
    expect(screen.getByRole("link", { name: "Loads" })).toHaveClass("active");
    expect(screen.getByRole("link", { name: "Docs" })).not.toHaveClass("active");
  });
});

describe("auth status", () => {
  it("shows neither auth buttons nor a user badge while auth is still loading", () => {
    mockAuthState = { user: null, loading: true };
    renderApp("/");
    expect(screen.queryByRole("button", { name: "Log in" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign up" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Log out" })).not.toBeInTheDocument();
  });

  it("shows Log in / Sign up once loading settles with no user", () => {
    renderApp("/");
    expect(screen.getByRole("button", { name: "Log in" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign up" })).toBeInTheDocument();
  });

  it("shows the company/role badge and a Log out button when logged in", () => {
    mockAuthState = { user: FAKE_USER, loading: false };
    renderApp("/");
    expect(screen.getByText("Acme Freight · Carrier")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Log in" })).not.toBeInTheDocument();
  });

  it("calls logout when Log out is clicked", async () => {
    mockAuthState = { user: FAKE_USER, loading: false };
    const user = userEvent.setup();
    renderApp("/");

    await user.click(screen.getByRole("button", { name: "Log out" }));

    expect(mockLogout).toHaveBeenCalledTimes(1);
  });
});

describe("auth modal", () => {
  it("is not rendered until something opens it", () => {
    renderApp("/");
    expect(screen.queryByTestId("auth-panel")).not.toBeInTheDocument();
  });

  it("opens in login mode from the header's Log in button", async () => {
    const user = userEvent.setup();
    renderApp("/");

    await user.click(screen.getByRole("button", { name: "Log in" }));

    expect(screen.getByTestId("auth-panel-mode")).toHaveTextContent("login");
  });

  it("opens in register mode from the header's Sign up button", async () => {
    const user = userEvent.setup();
    renderApp("/");

    await user.click(screen.getByRole("button", { name: "Sign up" }));

    expect(screen.getByTestId("auth-panel-mode")).toHaveTextContent("register");
  });

  it("opens in register mode when a routed page invokes its own openAuth prop", async () => {
    const user = userEvent.setup();
    renderApp("/");

    await user.click(screen.getByRole("button", { name: "Open signup from home" }));

    expect(screen.getByTestId("auth-panel-mode")).toHaveTextContent("register");
  });

  it("closes when the panel itself calls onClose", async () => {
    const user = userEvent.setup();
    renderApp("/");
    await user.click(screen.getByRole("button", { name: "Log in" }));
    expect(screen.getByTestId("auth-panel")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close panel" }));

    expect(screen.queryByTestId("auth-panel")).not.toBeInTheDocument();
  });

  it("closes when clicking the overlay outside the panel", async () => {
    const user = userEvent.setup();
    const { container } = renderApp("/");
    await user.click(screen.getByRole("button", { name: "Log in" }));
    expect(screen.getByTestId("auth-panel")).toBeInTheDocument();

    const overlay = container.querySelector(".modal-overlay");
    expect(overlay).not.toBeNull();
    await user.click(overlay as Element);

    expect(screen.queryByTestId("auth-panel")).not.toBeInTheDocument();
  });

  it("does not close when clicking inside the panel itself (overlay click stops propagation)", async () => {
    const user = userEvent.setup();
    renderApp("/");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    await user.click(screen.getByTestId("auth-panel"));

    expect(screen.getByTestId("auth-panel")).toBeInTheDocument();
  });
});
