import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchLoads } from "../api";
import type { Load, PaginatedLoads, User } from "../types";
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

function fakePage(total: number, overrides: Partial<PaginatedLoads> = {}): PaginatedLoads {
  return {
    items: total > 0 ? [fakeLoad()] : [],
    total,
    page: 1,
    page_size: 1,
    total_pages: Math.max(1, total),
    ...overrides,
  };
}

/** HomePage derives its two hero stats from `PaginatedLoads.total`, not
from fetching every load — one no-filter call (pageSize 1, just to read
`.total`) for the total count, one `status: "open"` call (same trick) for
the open count. Distinguishes the two calls by whether `status` was
passed, same as `fetchLoads` itself distinguishes them via the query
string. */
function mockStats(totalCount: number, openCount: number) {
  vi.mocked(fetchLoads).mockImplementation(async (params) => {
    if (params?.status === "open") return fakePage(openCount);
    return fakePage(totalCount);
  });
}

beforeEach(() => {
  mockUser = null;
  openAuth.mockReset();
  vi.mocked(fetchLoads).mockReset();
});

describe("load stats", () => {
  it("fetches loads on mount and shows the total and open counts", async () => {
    mockStats(3, 2);

    renderHomePage();

    expect(fetchLoads).toHaveBeenCalledTimes(2);
    expect(fetchLoads).toHaveBeenCalledWith({ pageSize: 1 });
    expect(fetchLoads).toHaveBeenCalledWith({ status: "open", pageSize: 1 });
    await waitFor(() => expect(screen.getByText("3")).toBeInTheDocument());
    expect(screen.getByText("Total loads").previousSibling).toHaveTextContent("3");
    expect(screen.getByText("Open now").previousSibling).toHaveTextContent("2");
  });

  it("only counts 'open' loads toward the Open now stat, not accepted/completed", async () => {
    mockStats(2, 0);

    renderHomePage();

    await waitFor(() => expect(screen.getByText("Total loads").previousSibling).toHaveTextContent("2"));
    expect(screen.getByText("Open now").previousSibling).toHaveTextContent("0");
  });

  it("shows zero counts, not a crash, when the load fetch fails", async () => {
    vi.mocked(fetchLoads).mockRejectedValue(new Error("network error"));

    renderHomePage();

    await waitFor(() => expect(fetchLoads).toHaveBeenCalledTimes(2));
    expect(screen.getByText("Total loads").previousSibling).toHaveTextContent("0");
    expect(screen.getByText("Open now").previousSibling).toHaveTextContent("0");
  });
});

describe("signed-out CTAs", () => {
  beforeEach(() => {
    mockStats(0, 0);
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
