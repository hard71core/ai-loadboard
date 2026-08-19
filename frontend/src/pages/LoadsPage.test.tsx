import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlaceResult } from "../placeSearch";
import type { User } from "../types";
import LoadsPage from "./LoadsPage";

vi.mock("../api", () => ({
  fetchLoads: vi.fn(),
  createLoad: vi.fn(),
  fetchMatches: vi.fn(),
  searchLoads: vi.fn(),
  acceptLoad: vi.fn(),
}));

vi.mock("../placeSearch", () => ({
  searchPlaces: vi.fn(),
}));

const SHIPPER: User = { id: 1, email: "shipper@example.com", company_name: "Test Shipper Co", role: "shipper" };

let mockUser: User | null = SHIPPER;
vi.mock("../AuthContext", () => ({
  useAuth: () => ({ user: mockUser, token: "fake-access-token" }),
}));

import { createLoad, fetchLoads } from "../api";
import { searchPlaces } from "../placeSearch";

function renderLoadsPage() {
  return render(
    <MemoryRouter>
      <LoadsPage openAuth={vi.fn()} />
    </MemoryRouter>,
  );
}

/** Types into a combobox, waits for its results, and clicks the option
matching `optionLabel` — the shared interaction pattern for both the state
combobox (synchronous) and the city combobox (debounced + async). */
async function pickFromCombobox(user: ReturnType<typeof userEvent.setup>, labelText: string, typed: string, optionLabel: string) {
  const input = await screen.findByLabelText(labelText);
  await user.click(input);
  await user.clear(input); // the input may already hold a previous selection's label
  await user.type(input, typed);
  const option = await screen.findByRole("option", { name: optionLabel });
  await user.click(option);
}

const DALLAS: PlaceResult = { city: "Dallas", stateCode: "TX" };
const MIAMI: PlaceResult = { city: "Miami", stateCode: "FL" };

beforeEach(() => {
  mockUser = SHIPPER;
  vi.mocked(fetchLoads).mockReset().mockResolvedValue([]);
  vi.mocked(createLoad).mockReset();
  vi.mocked(searchPlaces).mockReset().mockResolvedValue([]);
});

describe("LoadsPage — post-a-load location fields", () => {
  it("only offers cities once a state is picked, and posts a combined 'City, ST' string", async () => {
    vi.mocked(searchPlaces).mockImplementation(async (query) => {
      if (query.toLowerCase().startsWith("dal")) return [DALLAS];
      if (query.toLowerCase().startsWith("mia")) return [MIAMI];
      return [];
    });
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

    const user = userEvent.setup({ delay: null });
    renderLoadsPage();

    await waitFor(() => expect(fetchLoads).toHaveBeenCalled());
    await user.click(await screen.findByRole("button", { name: "+ Post a load" }));

    const originCity = await screen.findByLabelText("Origin — city");
    expect(originCity).toBeDisabled();

    await pickFromCombobox(user, "Origin — state", "Texas", "Texas");
    expect(originCity).toBeEnabled();
    await pickFromCombobox(user, "Origin — city", "Dal", "Dallas");

    await pickFromCombobox(user, "Destination — state", "Florida", "Florida");
    await pickFromCombobox(user, "Destination — city", "Mia", "Miami");

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

  it("rejects submitting typed-but-not-selected text instead of silently posting it", async () => {
    const user = userEvent.setup({ delay: null });
    renderLoadsPage();

    await waitFor(() => expect(fetchLoads).toHaveBeenCalled());
    await user.click(await screen.findByRole("button", { name: "+ Post a load" }));

    // Typed but never clicked a result — origin.state/.city never actually got set.
    await user.type(await screen.findByLabelText("Origin — state"), "Nowhereland");
    await user.type(screen.getByPlaceholderText("e.g. Home appliances"), "Test cargo");
    await user.type(screen.getByLabelText("Weight (lbs)"), "10000");
    await user.type(screen.getByLabelText("Rate (USD)"), "500");
    await user.click(screen.getByRole("button", { name: "Post load" }));

    expect(
      await screen.findByText(
        "Pick an origin and destination from the search results, not just typed text.",
      ),
    ).toBeInTheDocument();
    expect(createLoad).not.toHaveBeenCalled();
  });

  it("resets the city choice when the state changes", async () => {
    vi.mocked(searchPlaces).mockResolvedValue([DALLAS]);
    const user = userEvent.setup({ delay: null });
    renderLoadsPage();

    await waitFor(() => expect(fetchLoads).toHaveBeenCalled());
    await user.click(await screen.findByRole("button", { name: "+ Post a load" }));

    await pickFromCombobox(user, "Origin — state", "Texas", "Texas");
    await pickFromCombobox(user, "Origin — city", "Dal", "Dallas");
    expect(await screen.findByLabelText("Origin — city")).toHaveValue("Dallas");

    await pickFromCombobox(user, "Origin — state", "Florida", "Florida");
    // A Dallas left over from Texas would be wrong once the state's Florida.
    await waitFor(() => expect(screen.getByLabelText("Origin — city")).toHaveValue(""));
    expect(screen.getByLabelText("Origin — city")).toBeEnabled();
  });

  it("shows a curated list of cities on focus, before typing, with no call to live search — then hands off to live search once typing starts", async () => {
    const user = userEvent.setup({ delay: null });
    renderLoadsPage();

    await waitFor(() => expect(fetchLoads).toHaveBeenCalled());
    await user.click(await screen.findByRole("button", { name: "+ Post a load" }));

    await pickFromCombobox(user, "Origin — state", "Texas", "Texas");

    const originCity = await screen.findByLabelText("Origin — city");
    await user.click(originCity);

    // The curated fallback list for Texas, shown before any typing — see usCities.ts.
    expect(await screen.findByRole("option", { name: "Houston" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Dallas" })).toBeInTheDocument();
    expect(searchPlaces).not.toHaveBeenCalled();

    // The moment typing starts, live search takes over exactly as before.
    vi.mocked(searchPlaces).mockResolvedValue([DALLAS]);
    await user.type(originCity, "Dal");
    await waitFor(() => expect(searchPlaces).toHaveBeenCalledWith("Dal", "Texas", "TX"));
  });

  it("doesn't show the post-load form or button for a non-shipper", async () => {
    mockUser = { id: 2, email: "carrier@example.com", company_name: "Test Carrier Co", role: "carrier" };
    renderLoadsPage();

    await waitFor(() => expect(fetchLoads).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "+ Post a load" })).not.toBeInTheDocument();
  });
});
