import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Load, LoadETA } from "../types";
import EtaWindow from "./EtaWindow";

vi.mock("../api", () => ({
  fetchLoadEta: vi.fn(),
}));

import { fetchLoadEta } from "../api";

const BASE_LOAD: Load = {
  id: 1,
  title: "Refrigerated produce",
  origin: "Dallas, TX",
  destination: "Houston, TX",
  equipment_type: "Reefer",
  weight_lbs: 38000,
  price_usd: 850,
  shipper_name: "Northgate Foods",
  carrier_name: null,
  status: "open",
  created_at: "2026-08-16T15:06:37.441139Z",
  accepted_at: null,
};

function fakeEta(overrides: Partial<LoadETA> = {}): LoadETA {
  return {
    load_id: 1,
    status: "accepted",
    model_version: "eta-heuristic-v1",
    basis: "Estimated from accepted_at plus real driving distance/duration.",
    distance_miles: 238.4,
    drive_hours_min: 4.2,
    drive_hours_max: 5.5,
    eta_earliest: "2026-08-16T21:54:38.580006Z",
    eta_latest: "2026-08-16T23:10:40.740006Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(fetchLoadEta).mockReset();
});

describe("EtaWindow", () => {
  it("renders nothing for an open load, and never calls the API", () => {
    const { container } = render(<EtaWindow load={{ ...BASE_LOAD, status: "open" }} />);
    expect(container).toBeEmptyDOMElement();
    expect(fetchLoadEta).not.toHaveBeenCalled();
  });

  it("shows the formatted arrival window for an accepted load", async () => {
    vi.mocked(fetchLoadEta).mockResolvedValue(fakeEta());

    render(<EtaWindow load={{ ...BASE_LOAD, status: "accepted", accepted_at: "2026-08-16T17:41:11Z" }} />);

    expect(fetchLoadEta).toHaveBeenCalledWith(1);
    await waitFor(() =>
      expect(screen.queryByText("Calculating arrival window…")).not.toBeInTheDocument(),
    );
    expect(screen.queryByText("Estimate unavailable for this lane")).not.toBeInTheDocument();
    expect(
      screen.getByText(/Estimated from accepted_at plus real driving distance\/duration\./),
    ).toBeInTheDocument();
  });

  it("shows 'unavailable' when the API returns no window (routing failed)", async () => {
    vi.mocked(fetchLoadEta).mockResolvedValue(
      fakeEta({ eta_earliest: null, eta_latest: null, distance_miles: null, drive_hours_min: null, drive_hours_max: null }),
    );

    render(<EtaWindow load={{ ...BASE_LOAD, status: "accepted" }} />);

    await waitFor(() =>
      expect(screen.getByText("Estimate unavailable for this lane")).toBeInTheDocument(),
    );
  });

  it("shows 'unavailable' rather than crashing when the API call rejects", async () => {
    vi.mocked(fetchLoadEta).mockRejectedValue(new Error("network error"));

    render(<EtaWindow load={{ ...BASE_LOAD, status: "accepted" }} />);

    await waitFor(() =>
      expect(screen.getByText("Estimate unavailable for this lane")).toBeInTheDocument(),
    );
    expect(
      screen.getByText("Live routing data is temporarily unavailable for this lane."),
    ).toBeInTheDocument();
  });

  it("renders for a completed load too, not just accepted", async () => {
    vi.mocked(fetchLoadEta).mockResolvedValue(fakeEta({ status: "completed" }));

    render(<EtaWindow load={{ ...BASE_LOAD, status: "completed" }} />);

    expect(fetchLoadEta).toHaveBeenCalledWith(1);
    await waitFor(() =>
      expect(screen.queryByText("Calculating arrival window…")).not.toBeInTheDocument(),
    );
  });
});
