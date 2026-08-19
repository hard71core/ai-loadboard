import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlaceResult } from "../placeSearch";
import type { Load, PaginatedLoads, User } from "../types";
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

import { createLoad, fetchLoads, fetchMatches, searchLoads } from "../api";
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
    created_at: "2026-08-17T00:00:00Z",
    accepted_at: null,
    ...overrides,
  };
}

function fakePage(items: Load[], overrides: Partial<PaginatedLoads> = {}): PaginatedLoads {
  return {
    items,
    total: items.length,
    page: 1,
    page_size: 20,
    total_pages: 1,
    ...overrides,
  };
}

beforeEach(() => {
  mockUser = SHIPPER;
  vi.mocked(fetchLoads).mockReset().mockResolvedValue(fakePage([]));
  vi.mocked(createLoad).mockReset();
  vi.mocked(searchPlaces).mockReset().mockResolvedValue([]);
  vi.mocked(fetchMatches).mockReset();
  vi.mocked(searchLoads).mockReset();
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

describe("LoadsPage — pagination", () => {
  /** Three pages worth of loads, page-aware — mirrors the backend envelope
  well enough to drive Prev/Next through every boundary. */
  function mockThreePages() {
    vi.mocked(fetchLoads).mockImplementation(async (params) => {
      const page = params?.page ?? 1;
      return fakePage([fakeLoad({ id: page })], { page, page_size: 20, total: 45, total_pages: 3 });
    });
  }

  it("shows Page 1 of N with Prev disabled and Next enabled on the first page", async () => {
    mockThreePages();
    renderLoadsPage();

    expect(await screen.findByText("Page 1 of 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /prev/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /next/i })).toBeEnabled();
  });

  it("Next/Prev walk pages and fetch with the right page number, disabling at both ends", async () => {
    mockThreePages();
    const user = userEvent.setup({ delay: null });
    renderLoadsPage();
    await screen.findByText("Page 1 of 3");

    await user.click(screen.getByRole("button", { name: /next/i }));
    expect(await screen.findByText("Page 2 of 3")).toBeInTheDocument();
    expect(fetchLoads).toHaveBeenCalledWith({ page: 2, pageSize: 20 });
    expect(screen.getByRole("button", { name: /prev/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /next/i })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: /next/i }));
    expect(await screen.findByText("Page 3 of 3")).toBeInTheDocument();
    expect(fetchLoads).toHaveBeenCalledWith({ page: 3, pageSize: 20 });
    expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /prev/i }));
    expect(await screen.findByText("Page 2 of 3")).toBeInTheDocument();
    expect(fetchLoads).toHaveBeenCalledWith({ page: 2, pageSize: 20 });
  });

  it("hides pagination controls while a search is active", async () => {
    mockThreePages();
    vi.mocked(searchLoads).mockResolvedValue([fakeLoad()]);
    const user = userEvent.setup({ delay: null });
    renderLoadsPage();
    await screen.findByText("Page 1 of 3");

    await user.type(screen.getByPlaceholderText(/Search:/), "reefer");
    await user.click(screen.getByRole("button", { name: "Search" }));

    await waitFor(() => expect(screen.getByText("Search results")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /next/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /prev/i })).not.toBeInTheDocument();
  });

  it("hides pagination controls while recommended matches are active", async () => {
    mockUser = { id: 2, email: "carrier@example.com", company_name: "Test Carrier Co", role: "carrier" };
    mockThreePages();
    vi.mocked(fetchMatches).mockResolvedValue([fakeLoad()]);
    const user = userEvent.setup({ delay: null });
    renderLoadsPage();
    await screen.findByText("Page 1 of 3");

    await user.click(screen.getByRole("button", { name: "Recommended for you" }));

    await waitFor(() => expect(screen.getByText("Recommended for you")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /next/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /prev/i })).not.toBeInTheDocument();
  });

  it("resets to page 1 after posting a new load", async () => {
    mockThreePages();
    vi.mocked(createLoad).mockResolvedValue(fakeLoad({ id: 999 }));
    vi.mocked(searchPlaces).mockImplementation(async (query) => {
      if (query.toLowerCase().startsWith("dal")) return [DALLAS];
      if (query.toLowerCase().startsWith("mia")) return [MIAMI];
      return [];
    });
    const user = userEvent.setup({ delay: null });
    renderLoadsPage();
    await screen.findByText("Page 1 of 3");

    await user.click(screen.getByRole("button", { name: /next/i }));
    await screen.findByText("Page 2 of 3");

    await user.click(await screen.findByRole("button", { name: "+ Post a load" }));
    await pickFromCombobox(user, "Origin — state", "Texas", "Texas");
    await pickFromCombobox(user, "Origin — city", "Dal", "Dallas");
    await pickFromCombobox(user, "Destination — state", "Florida", "Florida");
    await pickFromCombobox(user, "Destination — city", "Mia", "Miami");
    await user.type(screen.getByPlaceholderText("e.g. Home appliances"), "Test cargo");
    await user.type(screen.getByLabelText("Weight (lbs)"), "10000");
    await user.type(screen.getByLabelText("Rate (USD)"), "500");
    await user.click(screen.getByRole("button", { name: "Post load" }));

    await waitFor(() => expect(fetchLoads).toHaveBeenCalledWith({ page: 1, pageSize: 20 }));
    expect(await screen.findByText("Page 1 of 3")).toBeInTheDocument();
  });
});
