import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Load, User } from "../types";
import LoadDetailPage from "./LoadDetailPage";

/** RouteMap (Leaflet) and EtaWindow each have their own tests (or, for
RouteMap, a documented gap — see testing.md — it'd need jsdom canvas/
geometry shims) and pull in geocode.ts/routing.ts/api.ts dependencies out
of scope here; mocked out so this file only exercises LoadDetailPage's own
logic: fetching, loading/error states, the detail fields, and the accept
flow. */
vi.mock("../components/RouteMap", () => ({
  default: () => <div data-testid="route-map" />,
}));
vi.mock("../components/EtaWindow", () => ({
  default: () => <div data-testid="eta-window" />,
}));

vi.mock("../api", () => ({
  fetchLoad: vi.fn(),
  acceptLoad: vi.fn(),
}));

const CARRIER: User = { id: 1, email: "carrier@example.com", company_name: "Acme Carrier Co", role: "carrier" };
const SHIPPER: User = { id: 2, email: "shipper@example.com", company_name: "Acme Shipper Co", role: "shipper" };

let mockUser: User | null = null;
let mockToken: string | null = null;
vi.mock("../AuthContext", () => ({
  useAuth: () => ({ user: mockUser, token: mockToken }),
}));

import { acceptLoad, fetchLoad } from "../api";

function fakeLoad(overrides: Partial<Load> = {}): Load {
  return {
    id: 5,
    title: "Reefer load of produce",
    origin: "Dallas, TX",
    destination: "Miami, FL",
    equipment_type: "Reefer",
    weight_lbs: 38000,
    price_usd: 1850,
    shipper_name: "Acme Shipper Co",
    carrier_name: null,
    status: "open",
    created_at: "2026-08-01T12:00:00Z",
    accepted_at: null,
    ...overrides,
  };
}

const openAuth = vi.fn();

function renderLoadDetailPage(id = "5") {
  return render(
    <MemoryRouter initialEntries={[`/loads/${id}`]}>
      <Routes>
        <Route path="/" element={<div>Home page</div>} />
        <Route path="/loads/:id" element={<LoadDetailPage openAuth={openAuth} />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockUser = null;
  mockToken = null;
  openAuth.mockReset();
  vi.mocked(fetchLoad).mockReset();
  vi.mocked(acceptLoad).mockReset();
});

describe("loading and error states", () => {
  it("shows a loading skeleton while the fetch is in flight", async () => {
    let resolveFetch!: (load: Load) => void;
    vi.mocked(fetchLoad).mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );

    renderLoadDetailPage();

    expect(screen.queryByText("Reefer load of produce")).not.toBeInTheDocument();
    expect(document.querySelector(".skeleton")).not.toBeNull();

    resolveFetch(fakeLoad());
    await waitFor(() => expect(screen.getByText("Reefer load of produce")).toBeInTheDocument());
  });

  it("shows the error message and a back link when the fetch fails", async () => {
    vi.mocked(fetchLoad).mockRejectedValue(new Error("Load not found"));

    renderLoadDetailPage();

    expect(await screen.findByText("Load not found")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "← Back to loads" })).toHaveAttribute("href", "/");
  });

  it("fetches the load for the id in the route", async () => {
    vi.mocked(fetchLoad).mockResolvedValue(fakeLoad());
    renderLoadDetailPage("42");
    await waitFor(() => expect(fetchLoad).toHaveBeenCalledWith(42));
  });
});

describe("load detail fields", () => {
  it("renders the load's core details", async () => {
    vi.mocked(fetchLoad).mockResolvedValue(
      fakeLoad({
        weight_lbs: 38000,
        price_usd: 1850,
        carrier_name: null,
      }),
    );

    renderLoadDetailPage();

    expect(await screen.findByText("Dallas, TX → Miami, FL")).toBeInTheDocument();
    expect(screen.getByText("Reefer load of produce")).toBeInTheDocument();
    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(screen.getByText("Reefer")).toBeInTheDocument();
    expect(screen.getByText("38,000 lbs")).toBeInTheDocument();
    expect(screen.getByText("$1850.00")).toBeInTheDocument();
    expect(screen.getByText("Acme Shipper Co")).toBeInTheDocument();
    expect(screen.getByTestId("route-map")).toBeInTheDocument();
    expect(screen.getByTestId("eta-window")).toBeInTheDocument();
    expect(screen.queryByText("Carrier")).not.toBeInTheDocument();
  });

  it("shows the carrier row once a load has been accepted", async () => {
    vi.mocked(fetchLoad).mockResolvedValue(
      fakeLoad({ status: "accepted", carrier_name: "Acme Carrier Co", accepted_at: "2026-08-02T00:00:00Z" }),
    );

    renderLoadDetailPage();

    expect(await screen.findByText("Carrier")).toBeInTheDocument();
    expect(screen.getByText("Acme Carrier Co")).toBeInTheDocument();
  });
});

describe("accept flow", () => {
  it("shows an 'Accept load' button for a logged-in carrier on an open load, and accepts it", async () => {
    mockUser = CARRIER;
    mockToken = "fake-access-token";
    vi.mocked(fetchLoad).mockResolvedValue(fakeLoad());
    vi.mocked(acceptLoad).mockResolvedValue(fakeLoad({ status: "accepted", carrier_name: CARRIER.company_name }));

    const user = userEvent.setup();
    renderLoadDetailPage();

    const acceptButton = await screen.findByRole("button", { name: "Accept load" });
    await user.click(acceptButton);

    await waitFor(() => expect(acceptLoad).toHaveBeenCalledWith(5, "fake-access-token"));
    await waitFor(() => expect(fetchLoad).toHaveBeenCalledTimes(2));
  });

  it("shows an error and doesn't refetch when accepting fails", async () => {
    mockUser = CARRIER;
    mockToken = "fake-access-token";
    vi.mocked(fetchLoad).mockResolvedValue(fakeLoad());
    vi.mocked(acceptLoad).mockRejectedValue(new Error("Load already accepted"));

    const user = userEvent.setup();
    renderLoadDetailPage();

    await user.click(await screen.findByRole("button", { name: "Accept load" }));

    expect(await screen.findByText("Load already accepted")).toBeInTheDocument();
    expect(fetchLoad).toHaveBeenCalledTimes(1);
  });

  it("shows a 'Log in to accept' button for a logged-out visitor, opening the auth modal", async () => {
    vi.mocked(fetchLoad).mockResolvedValue(fakeLoad());

    const user = userEvent.setup();
    renderLoadDetailPage();

    const loginButton = await screen.findByRole("button", { name: "Log in to accept" });
    await user.click(loginButton);

    expect(openAuth).toHaveBeenCalledWith("register");
    expect(acceptLoad).not.toHaveBeenCalled();
  });

  it("shows no accept/login button for a shipper viewing an open load", async () => {
    mockUser = SHIPPER;
    mockToken = "fake-access-token";
    vi.mocked(fetchLoad).mockResolvedValue(fakeLoad());

    renderLoadDetailPage();

    await screen.findByText("Reefer load of produce");
    expect(screen.queryByRole("button", { name: "Accept load" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Log in to accept" })).not.toBeInTheDocument();
  });

  it("shows a back button instead of an accept button once a load is no longer open", async () => {
    mockUser = CARRIER;
    mockToken = "fake-access-token";
    vi.mocked(fetchLoad).mockResolvedValue(fakeLoad({ status: "completed", carrier_name: CARRIER.company_name }));

    const user = userEvent.setup();
    renderLoadDetailPage();

    expect(screen.queryByRole("button", { name: "Accept load" })).not.toBeInTheDocument();
    const backButton = await screen.findAllByRole("button", { name: "← Back to loads" });
    // Only the status !== "open" button is a <button>; the top one is a <Link>.
    expect(backButton).toHaveLength(1);

    await user.click(backButton[0]);
    expect(await screen.findByText("Home page")).toBeInTheDocument();
  });
});
