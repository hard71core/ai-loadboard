import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DrivingRoute } from "../routing";
import type { Coordinates } from "../geocode";
import RouteMap from "./RouteMap";

/** Real Leaflet map rendering needs canvas/geometry support jsdom doesn't
have. RouteMap's own logic worth testing — the loading/unavailable/ready
state machine, distance/duration formatting, the solid-vs-dashed "real
route vs. straight-line fallback" branching, the caption text — doesn't
actually require a real Leaflet map instance, so react-leaflet is mocked
out the same way LoadDetailPage.test.tsx mocks RouteMap itself: simple
stub components that just render their children/props into plain divs.
`leaflet` (the `L` import — `L.divIcon`, `L.latLngBounds`) is NOT mocked;
those are plain data/DOM-string helpers, not map rendering, and work fine
under jsdom as-is. */
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="map-container">{children}</div>
  ),
  TileLayer: () => <div data-testid="tile-layer" />,
  Marker: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="marker">{children}</div>
  ),
  Popup: ({ children }: { children?: React.ReactNode }) => <div data-testid="popup">{children}</div>,
  Polyline: ({ pathOptions }: { pathOptions?: { dashArray?: string } }) => (
    <div data-testid="polyline" data-dasharray={pathOptions?.dashArray ?? ""} />
  ),
  useMap: () => ({ fitBounds: vi.fn() }),
}));

vi.mock("../geocode", async () => {
  const actual = await vi.importActual<typeof import("../geocode")>("../geocode");
  return {
    ...actual,
    geocodeLocation: vi.fn(),
  };
});
vi.mock("../routing", () => ({
  fetchDrivingRoute: vi.fn(),
}));

import { geocodeLocation } from "../geocode";
import { fetchDrivingRoute } from "../routing";

const DALLAS: Coordinates = { lat: 32.7767, lng: -96.797 };
const MIAMI: Coordinates = { lat: 25.7617, lng: -80.1918 };

function fakeRoute(overrides: Partial<DrivingRoute> = {}): DrivingRoute {
  return {
    path: [
      [DALLAS.lat, DALLAS.lng],
      [MIAMI.lat, MIAMI.lng],
    ],
    distanceMiles: 1310.4,
    durationMinutes: 1180, // 19h 40m
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(geocodeLocation).mockReset();
  vi.mocked(fetchDrivingRoute).mockReset();
});

describe("RouteMap", () => {
  it("shows the loading skeleton while geocoding is in flight", () => {
    vi.mocked(geocodeLocation).mockReturnValue(new Promise(() => {})); // never resolves

    render(<RouteMap origin="Dallas, TX" destination="Miami, FL" />);

    expect(screen.getByLabelText("Loading map…")).toBeInTheDocument();
    expect(screen.queryByTestId("map-container")).not.toBeInTheDocument();
  });

  it("shows the unavailable state when either origin or destination fails to geocode", async () => {
    vi.mocked(geocodeLocation).mockImplementation(async (query: string) =>
      query === "Dallas, TX" ? DALLAS : null,
    );

    render(<RouteMap origin="Dallas, TX" destination="Nowhereville, XX" />);

    expect(
      await screen.findByText("Map preview isn't available for this route right now."),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("map-container")).not.toBeInTheDocument();
    expect(fetchDrivingRoute).not.toHaveBeenCalled();
  });

  it("renders the real route's distance/duration once fetchDrivingRoute resolves, with a solid line", async () => {
    vi.mocked(geocodeLocation).mockImplementation(async (query: string) =>
      query === "Dallas, TX" ? DALLAS : MIAMI,
    );
    vi.mocked(fetchDrivingRoute).mockResolvedValue(fakeRoute());

    render(<RouteMap origin="Dallas, TX" destination="Miami, FL" />);

    expect(await screen.findByTestId("map-container")).toBeInTheDocument();
    // distanceMiles from the real route (1310.4), not the haversine fallback
    await waitFor(() => expect(screen.getByText("1,310 mi")).toBeInTheDocument());
    // 1180 minutes -> "19h 40m"
    expect(screen.getByText("19h 40m")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Driving route via OSRM — a general driving-time estimate, not adjusted for truck routing, hours-of-service limits, or live traffic.",
      ),
    ).toBeInTheDocument();

    // Real route -> the accent polyline has no dashArray (solid line).
    const polylines = screen.getAllByTestId("polyline");
    const accentLine = polylines[polylines.length - 1];
    expect(accentLine.dataset.dasharray).toBe("");
  });

  it("falls back to the haversine straight-line distance and a dashed caption when routing fails", async () => {
    vi.mocked(geocodeLocation).mockImplementation(async (query: string) =>
      query === "Dallas, TX" ? DALLAS : MIAMI,
    );
    vi.mocked(fetchDrivingRoute).mockResolvedValue(null);

    render(<RouteMap origin="Dallas, TX" destination="Miami, FL" />);

    expect(await screen.findByTestId("map-container")).toBeInTheDocument();

    await waitFor(() =>
      expect(
        screen.getByText(/Live routing is temporarily unavailable — showing the ~/),
      ).toBeInTheDocument(),
    );
    // "—" placeholder for drive time, since there's no real route.
    expect(screen.getByText("—")).toBeInTheDocument();

    // Fallback -> the accent polyline is dashed.
    const polylines = screen.getAllByTestId("polyline");
    const accentLine = polylines[polylines.length - 1];
    expect(accentLine.dataset.dasharray).toBe("7 9");
  });

  it("formats a sub-hour duration as minutes only", async () => {
    vi.mocked(geocodeLocation).mockImplementation(async (query: string) =>
      query === "Dallas, TX" ? DALLAS : MIAMI,
    );
    vi.mocked(fetchDrivingRoute).mockResolvedValue(fakeRoute({ durationMinutes: 45 }));

    render(<RouteMap origin="Dallas, TX" destination="Miami, FL" />);

    await waitFor(() => expect(screen.getByText("45m")).toBeInTheDocument());
    expect(screen.queryByText(/h \d+m/)).not.toBeInTheDocument();
  });

  it("shows the route skeleton and 'calculating' caption while geocoding is done but the driving route is still in flight", async () => {
    vi.mocked(geocodeLocation).mockImplementation(async (query: string) =>
      query === "Dallas, TX" ? DALLAS : MIAMI,
    );
    vi.mocked(fetchDrivingRoute).mockReturnValue(new Promise(() => {})); // never resolves

    render(<RouteMap origin="Dallas, TX" destination="Miami, FL" />);

    expect(await screen.findByTestId("map-container")).toBeInTheDocument();
    expect(screen.getByText("Calculating the driving route…")).toBeInTheDocument();
    expect(document.querySelectorAll(".route-estimate-skeleton")).toHaveLength(2);
    expect(screen.queryByText("mi")).not.toBeInTheDocument();
  });

  it("doesn't let a stale in-flight driving-route response overwrite state after props change again", async () => {
    let resolveFirstRoute!: (v: DrivingRoute | null) => void;
    const firstRoute = new Promise<DrivingRoute | null>((resolve) => {
      resolveFirstRoute = resolve;
    });

    vi.mocked(geocodeLocation).mockImplementation(async (query: string) =>
      query === "Dallas, TX" ? DALLAS : query === "Houston, TX" ? { lat: 29.7604, lng: -95.3698 } : MIAMI,
    );
    vi.mocked(fetchDrivingRoute).mockReturnValueOnce(firstRoute);

    const { rerender } = render(<RouteMap origin="Dallas, TX" destination="Houston, TX" />);

    // Wait until geocoding for the first pair has resolved (state "ready", route still loading).
    await waitFor(() => expect(screen.getByTestId("map-container")).toBeInTheDocument());
    expect(fetchDrivingRoute).toHaveBeenCalledTimes(1);

    // Change props before the first driving-route fetch resolves.
    vi.mocked(fetchDrivingRoute).mockResolvedValue(fakeRoute());
    rerender(<RouteMap origin="Dallas, TX" destination="Miami, FL" />);

    await waitFor(() => expect(screen.getByText("1,310 mi")).toBeInTheDocument());

    // Now resolve the stale first route — it must not clobber the second run's result.
    resolveFirstRoute(fakeRoute({ distanceMiles: 999, durationMinutes: 10 }));
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByText("1,310 mi")).toBeInTheDocument();
    expect(screen.queryByText("999 mi")).not.toBeInTheDocument();
  });

  it("doesn't let a stale in-flight response overwrite state after origin/destination change", async () => {
    let resolveFirst!: (v: Coordinates | null) => void;
    const firstCall = new Promise<Coordinates | null>((resolve) => {
      resolveFirst = resolve;
    });

    vi.mocked(geocodeLocation).mockImplementationOnce(() => firstCall);
    vi.mocked(geocodeLocation).mockImplementationOnce(() => firstCall);

    const { rerender } = render(<RouteMap origin="Dallas, TX" destination="Houston, TX" />);

    expect(screen.getByLabelText("Loading map…")).toBeInTheDocument();

    // Props change before the first pair of geocode calls resolves — this
    // should cancel the first effect run via its cleanup ("cancelled" guard).
    vi.mocked(geocodeLocation).mockImplementation(async (query: string) =>
      query === "Dallas, TX" ? DALLAS : MIAMI,
    );
    vi.mocked(fetchDrivingRoute).mockResolvedValue(fakeRoute());

    rerender(<RouteMap origin="Dallas, TX" destination="Miami, FL" />);

    // Now resolve the stale first call — it must not push the component into
    // the "unavailable" state or otherwise clobber the second run's result.
    resolveFirst(null);

    await waitFor(() => expect(screen.getByTestId("map-container")).toBeInTheDocument());
    expect(
      screen.queryByText("Map preview isn't available for this route right now."),
    ).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("1,310 mi")).toBeInTheDocument());
  });
});
