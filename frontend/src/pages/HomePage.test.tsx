import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchLoads } from "../api";
import type { Load, User } from "../types";
import HomePage from "./HomePage";

/** useCountUp is a purely cosmetic rAF-driven animation (see its own
docstring) — mocked here as the identity function so tests assert on the
real target numbers instead of driving requestAnimationFrame frames. */
vi.mock("../hooks/useCountUp", () => ({
  useCountUp: (target: number) => target,
}));

vi.mock("../api", () => ({
  fetchLoads: vi.fn(),
}));

let mockUser: User | null = null;
vi.mock("../AuthContext", () => ({
  useAuth: () => ({ user: mockUser }),
}));

function fakeLoad(overrides: Partial<Load> = {}): Load {
  return {
    id: 1,
    title: "Reefer load",
    origin: "Dallas, TX",
    destination: "Houston, TX",
    equipment_type: "Reefer",
    weight_lbs: 38000,
    price_usd: 850,
    shipper_name: "Acme Shipping",
    carrier_name: null,
    status: "open",
    created_at: "2026-08-01T00:00:00Z",
    accepted_at: null,
    ...overrides,
  };
}

const openAuth = vi.fn();

function renderHomePage() {
  return render(
    <MemoryRouter>
      <HomePage openAuth={openAuth} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockUser = null;
  openAuth.mockReset();
  vi.mocked(fetchLoads).mockReset();
});

describe("load stats", () => {
  it("fetches loads on mount and shows the total and open counts", async () => {
    vi.mocked(fetchLoads).mockResolvedValue([
      fakeLoad({ id: 1, status: "open" }),
      fakeLoad({ id: 2, status: "open" }),
      fakeLoad({ id: 3, status: "completed" }),
    ]);

    renderHomePage();

    expect(fetchLoads).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByText("3")).toBeInTheDocument());
    expect(screen.getByText("Total loads").previousSibling).toHaveTextContent("3");
    expect(screen.getByText("Open now").previousSibling).toHaveTextContent("2");
  });

  it("only counts 'open' loads toward the Open now stat, not accepted/completed", async () => {
    vi.mocked(fetchLoads).mockResolvedValue([
      fakeLoad({ id: 1, status: "accepted" }),
      fakeLoad({ id: 2, status: "completed" }),
    ]);

    renderHomePage();

    await waitFor(() => expect(screen.getByText("Total loads").previousSibling).toHaveTextContent("2"));
    expect(screen.getByText("Open now").previousSibling).toHaveTextContent("0");
  });

  it("shows zero counts, not a crash, when the load fetch fails", async () => {
    vi.mocked(fetchLoads).mockRejectedValue(new Error("network error"));

    renderHomePage();

    await waitFor(() => expect(fetchLoads).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Total loads").previousSibling).toHaveTextContent("0");
    expect(screen.getByText("Open now").previousSibling).toHaveTextContent("0");
  });
});

describe("signed-out CTAs", () => {
  beforeEach(() => {
    vi.mocked(fetchLoads).mockResolvedValue([]);
  });

  it("shows a 'Sign up free' button in the hero and the CTA band when logged out", async () => {
    renderHomePage();
    await waitFor(() => expect(fetchLoads).toHaveBeenCalled());

    expect(screen.getAllByRole("button", { name: "Sign up free" })).toHaveLength(2);
  });

  it("opens the register modal from either 'Sign up free' button — hero and CTA band", async () => {
    const user = userEvent.setup();
    renderHomePage();
    await waitFor(() => expect(fetchLoads).toHaveBeenCalled());
    const [heroButton, ctaBandButton] = screen.getAllByRole("button", { name: "Sign up free" });

    await user.click(heroButton);
    expect(openAuth).toHaveBeenCalledWith("register");

    openAuth.mockClear();
    await user.click(ctaBandButton);
    expect(openAuth).toHaveBeenCalledWith("register");
  });

  it("hides both 'Sign up free' buttons once a user is logged in", async () => {
    mockUser = { id: 1, email: "carrier@example.com", company_name: "Acme Co", role: "carrier" };
    renderHomePage();
    await waitFor(() => expect(fetchLoads).toHaveBeenCalled());

    expect(screen.queryByRole("button", { name: "Sign up free" })).not.toBeInTheDocument();
  });

  it("links both 'Browse loads' CTAs to /loads regardless of auth state", async () => {
    renderHomePage();
    await waitFor(() => expect(fetchLoads).toHaveBeenCalled());

    const links = screen.getAllByRole("link", { name: "Browse loads" });
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toHaveAttribute("href", "/loads");
    }
  });
});
