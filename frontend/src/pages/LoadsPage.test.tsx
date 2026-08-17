import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "../types";
import LoadsPage from "./LoadsPage";

vi.mock("../api", () => ({
  fetchLoads: vi.fn(),
  createLoad: vi.fn(),
  fetchMatches: vi.fn(),
  searchLoads: vi.fn(),
  acceptLoad: vi.fn(),
}));

const SHIPPER: User = { id: 1, email: "shipper@example.com", company_name: "Test Shipper Co", role: "shipper" };

let mockUser: User | null = SHIPPER;
vi.mock("../AuthContext", () => ({
  useAuth: () => ({ user: mockUser, token: "fake-access-token" }),
}));

import { createLoad, fetchLoads } from "../api";

function renderLoadsPage() {
  return render(
    <MemoryRouter>
      <LoadsPage openAuth={vi.fn()} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockUser = SHIPPER;
  vi.mocked(fetchLoads).mockReset().mockResolvedValue([]);
  vi.mocked(createLoad).mockReset();
});

describe("LoadsPage — post-a-load location fields", () => {
  it("only offers cities once a state is picked, and posts a combined 'City, ST' string", async () => {
    vi.mocked(createLoad).mockResolvedValue({
      id: 99,
      title: "Test cargo",
      origin: "Dallas, TX",
      destination: "Miami, FL",
      equipment_type: "Dry Van",
      weight_lbs: 10000,
      price_usd: 500,
      shipper_name: "Test Shipper Co",
      carrier_name: null,
      status: "open",
      created_at: "2026-08-17T00:00:00Z",
      accepted_at: null,
    });

    const user = userEvent.setup();
    renderLoadsPage();

    await waitFor(() => expect(fetchLoads).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "+ Post a load" }));

    const originCity = screen.getByLabelText("Origin — city") as HTMLSelectElement;
    const destCity = screen.getByLabelText("Destination — city") as HTMLSelectElement;

    // No state picked yet — the city select has nothing to offer.
    expect(originCity).toBeDisabled();
    expect(originCity.options.length).toBe(1); // just the placeholder

    await user.selectOptions(screen.getByLabelText("Origin — state"), "TX");
    expect(originCity).toBeEnabled();
    await user.selectOptions(originCity, "Dallas");

    await user.selectOptions(screen.getByLabelText("Destination — state"), "FL");
    await user.selectOptions(destCity, "Miami");

    await user.type(screen.getByPlaceholderText("e.g. Home appliances"), "Test cargo");
    await user.type(screen.getByLabelText("Weight (lbs)"), "10000");
    await user.type(screen.getByLabelText("Rate (USD)"), "500");
    await user.click(screen.getByRole("button", { name: "Post load" }));

    await waitFor(() =>
      expect(createLoad).toHaveBeenCalledWith(
        expect.objectContaining({ origin: "Dallas, TX", destination: "Miami, FL" }),
        "fake-access-token",
      ),
    );
  });

  it("resets the city choice when the state changes", async () => {
    const user = userEvent.setup();
    renderLoadsPage();

    await waitFor(() => expect(fetchLoads).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "+ Post a load" }));

    const originState = screen.getByLabelText("Origin — state");
    const originCity = screen.getByLabelText("Origin — city") as HTMLSelectElement;

    await user.selectOptions(originState, "TX");
    await user.selectOptions(originCity, "Dallas");
    expect(originCity.value).toBe("Dallas");

    await user.selectOptions(originState, "FL");
    expect(originCity.value).toBe(""); // a Dallas left over from TX would be wrong once the state's FL
    expect(originCity).toBeEnabled();
  });

  it("doesn't show the post-load form or button for a non-shipper", async () => {
    mockUser = { id: 2, email: "carrier@example.com", company_name: "Test Carrier Co", role: "carrier" };
    renderLoadsPage();

    await waitFor(() => expect(fetchLoads).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "+ Post a load" })).not.toBeInTheDocument();
  });
});
