import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Load, User } from "../types";
import ProfilePage from "./ProfilePage";

vi.mock("../api", () => ({
  fetchMyLoads: vi.fn(),
  updateProfile: vi.fn(),
}));

const SHIPPER: User = { id: 1, email: "shipper@example.com", company_name: "Acme Shipping", role: "shipper" };
const CARRIER: User = { id: 2, email: "carrier@example.com", company_name: "Acme Carrier", role: "carrier" };

let mockUser: User | null = SHIPPER;
const mockUpdateUser = vi.fn();
vi.mock("../AuthContext", () => ({
  useAuth: () => ({ user: mockUser, token: mockUser ? "fake-access-token" : null, updateUser: mockUpdateUser }),
}));

import { fetchMyLoads, updateProfile } from "../api";

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

function renderProfilePage() {
  return render(
    <MemoryRouter initialEntries={["/profile"]}>
      <Routes>
        <Route path="/profile" element={<ProfilePage openAuth={openAuth} />} />
        <Route path="/loads/:id" element={<div>Load detail page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockUser = SHIPPER;
  openAuth.mockReset();
  mockUpdateUser.mockReset();
  vi.mocked(fetchMyLoads).mockReset().mockResolvedValue([]);
  vi.mocked(updateProfile).mockReset();
});

describe("logged out", () => {
  it("shows a login prompt instead of a profile, and never calls fetchMyLoads", async () => {
    mockUser = null;
    renderProfilePage();

    expect(screen.getByText("Log in to see your profile and your loads.")).toBeInTheDocument();
    expect(fetchMyLoads).not.toHaveBeenCalled();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Log in" }));
    expect(openAuth).toHaveBeenCalledWith("login");
  });
});

describe("profile fields and loads", () => {
  it("fetches the caller's loads on mount and renders profile fields", async () => {
    renderProfilePage();

    await waitFor(() => expect(fetchMyLoads).toHaveBeenCalledWith("fake-access-token"));
    expect(screen.getByText("Acme Shipping")).toBeInTheDocument();
    expect(screen.getByText("shipper@example.com")).toBeInTheDocument();
    expect(screen.getByText("Shipper")).toBeInTheDocument();
  });

  it("shows per-status counts derived from the loads list", async () => {
    vi.mocked(fetchMyLoads).mockResolvedValue([
      fakeLoad({ id: 1, status: "open" }),
      fakeLoad({ id: 2, status: "open" }),
      fakeLoad({ id: 3, status: "accepted" }),
      fakeLoad({ id: 4, status: "completed" }),
    ]);

    const { container } = renderProfilePage();
    await waitFor(() => expect(fetchMyLoads).toHaveBeenCalled());

    // Scoped to .profile-stats — the loads table below repeats these same
    // words as per-row status badges, so an unscoped query would be
    // ambiguous.
    const stats = within(container.querySelector(".profile-stats") as HTMLElement);
    expect(stats.getByText("Open").previousSibling).toHaveTextContent("2");
    expect(stats.getByText("Accepted").previousSibling).toHaveTextContent("1");
    expect(stats.getByText("Completed").previousSibling).toHaveTextContent("1");
  });

  it("shows a role-appropriate empty state when the caller has no loads", async () => {
    renderProfilePage();
    expect(await screen.findByText("You haven't posted any loads yet.")).toBeInTheDocument();

    mockUser = CARRIER;
    renderProfilePage();
    expect(await screen.findByText("You haven't accepted any loads yet.")).toBeInTheDocument();
  });

  it("renders the loads table, the carrier once one's assigned, and navigates to a load's detail page on click", async () => {
    vi.mocked(fetchMyLoads).mockResolvedValue([
      fakeLoad({ id: 7, status: "accepted", carrier_name: "Acme Carrier" }),
    ]);
    const user = userEvent.setup();
    renderProfilePage();

    expect(await screen.findByText("Carrier: Acme Carrier")).toBeInTheDocument();
    const row = screen.getByText("Reefer load");
    await user.click(row.closest("tr")!);

    expect(await screen.findByText("Load detail page")).toBeInTheDocument();
  });

  it("shows an error alert when fetching loads fails", async () => {
    vi.mocked(fetchMyLoads).mockRejectedValue(new Error("Failed to load your loads"));
    renderProfilePage();
    expect(await screen.findByText("Failed to load your loads")).toBeInTheDocument();
  });
});

describe("editing the company name", () => {
  it("opens a pre-filled form, saves, and updates the shared auth user", async () => {
    vi.mocked(updateProfile).mockResolvedValue({ ...SHIPPER, company_name: "New Name LLC" });
    const user = userEvent.setup();
    renderProfilePage();
    await waitFor(() => expect(fetchMyLoads).toHaveBeenCalled());

    await user.click(screen.getByRole("button", { name: "Edit company name" }));
    const input = screen.getByLabelText("Company name") as HTMLInputElement;
    expect(input.value).toBe("Acme Shipping");

    await user.clear(input);
    await user.type(input, "New Name LLC");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(updateProfile).toHaveBeenCalledWith({ company_name: "New Name LLC" }, "fake-access-token"),
    );
    expect(mockUpdateUser).toHaveBeenCalledWith({ ...SHIPPER, company_name: "New Name LLC" });
    // Back to the read-only view once saved.
    expect(screen.queryByLabelText("Company name")).not.toBeInTheDocument();
  });

  it("shows an error and stays in edit mode when saving fails", async () => {
    vi.mocked(updateProfile).mockRejectedValue(new Error("Company name is required"));
    const user = userEvent.setup();
    renderProfilePage();
    await waitFor(() => expect(fetchMyLoads).toHaveBeenCalled());

    await user.click(screen.getByRole("button", { name: "Edit company name" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Company name is required")).toBeInTheDocument();
    expect(screen.getByLabelText("Company name")).toBeInTheDocument();
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("discards changes on Cancel without calling updateProfile", async () => {
    const user = userEvent.setup();
    renderProfilePage();
    await waitFor(() => expect(fetchMyLoads).toHaveBeenCalled());

    await user.click(screen.getByRole("button", { name: "Edit company name" }));
    await user.type(screen.getByLabelText("Company name"), " Inc");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByLabelText("Company name")).not.toBeInTheDocument();
    expect(screen.getByText("Acme Shipping")).toBeInTheDocument();
    expect(updateProfile).not.toHaveBeenCalled();
  });
});
