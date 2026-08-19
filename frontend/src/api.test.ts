import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  acceptLoad,
  createLoad,
  fetchLoad,
  fetchLoadEta,
  fetchLoads,
  fetchMatches,
  loginUser,
  logoutUser,
  refreshAccessToken,
  registerUser,
  searchLoads,
} from "./api";
import type {
  AuthResponse,
  Load,
  LoadCreatePayload,
  LoadETA,
  LoginPayload,
  PaginatedLoads,
  RegisterPayload,
} from "./types";

// api.ts falls back to this whenever VITE_API_URL isn't set, which is the
// case in the test environment (no .env picked up by vitest).
const API_URL = "http://localhost:8000";

const FAKE_LOAD: Load = {
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
};

const FAKE_PAGE: PaginatedLoads = {
  items: [FAKE_LOAD],
  total: 1,
  page: 1,
  page_size: 20,
  total_pages: 1,
};

const FAKE_ETA: LoadETA = {
  load_id: 1,
  status: "accepted",
  model_version: "v0",
  basis: "osrm",
  distance_miles: 240,
  drive_hours_min: 4,
  drive_hours_max: 6,
  eta_earliest: "2026-08-02T00:00:00Z",
  eta_latest: "2026-08-02T06:00:00Z",
};

const FAKE_AUTH: AuthResponse = {
  access_token: "fake-access-token",
  refresh_token: "fake-refresh-token",
  token_type: "bearer",
  user: { id: 1, email: "carrier@example.com", company_name: "Test Carrier Co", role: "carrier" },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** A non-OK response with no JSON body at all — exercises handle()'s
fallback-message path (e.g. a proxy 502 with an HTML or empty body). */
function emptyErrorResponse(status: number): Response {
  return new Response("", { status });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("shared error handling", () => {
  it("resolves with the parsed JSON body on a 2xx response", async () => {
    fetchMock.mockResolvedValue(jsonResponse(FAKE_PAGE));
    await expect(fetchLoads()).resolves.toEqual(FAKE_PAGE);
  });

  it("throws the server's detail message on a non-OK response", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: "Load not found" }, 404));
    await expect(fetchLoad(999)).rejects.toThrow("Load not found");
  });

  it("falls back to a generic message when the error response has no JSON body", async () => {
    fetchMock.mockResolvedValue(emptyErrorResponse(500));
    await expect(fetchLoads()).rejects.toThrow("Failed to load the load list");
  });

  it("falls back to a generic message when the JSON body has no detail field", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 500));
    await expect(fetchLoads()).rejects.toThrow("Failed to load the load list");
  });
});

describe("fetchLoads", () => {
  it("GETs /api/loads with no auth header and no query string when called with no params", async () => {
    fetchMock.mockResolvedValue(jsonResponse(FAKE_PAGE));
    await fetchLoads();
    expect(fetchMock).toHaveBeenCalledWith(`${API_URL}/api/loads`);
  });

  it("resolves with the paginated envelope, not a bare array", async () => {
    fetchMock.mockResolvedValue(jsonResponse(FAKE_PAGE));
    await expect(fetchLoads()).resolves.toEqual(FAKE_PAGE);
  });

  it("builds a query string only from the params actually passed", async () => {
    fetchMock.mockResolvedValue(jsonResponse(FAKE_PAGE));
    await fetchLoads({ status: "open", page: 2, pageSize: 10 });
    expect(fetchMock).toHaveBeenCalledWith(`${API_URL}/api/loads?status=open&page=2&page_size=10`);
  });

  it("omits params that weren't passed rather than sending defaults", async () => {
    fetchMock.mockResolvedValue(jsonResponse(FAKE_PAGE));
    await fetchLoads({ page: 3 });
    expect(fetchMock).toHaveBeenCalledWith(`${API_URL}/api/loads?page=3`);
  });
});

describe("fetchLoad", () => {
  it("GETs /api/loads/:id", async () => {
    fetchMock.mockResolvedValue(jsonResponse(FAKE_LOAD));
    await fetchLoad(42);
    expect(fetchMock).toHaveBeenCalledWith(`${API_URL}/api/loads/42`);
  });
});

describe("searchLoads", () => {
  it("POSTs the query as JSON", async () => {
    fetchMock.mockResolvedValue(jsonResponse([FAKE_LOAD]));
    await searchLoads("reefer out of Dallas under 900");
    expect(fetchMock).toHaveBeenCalledWith(`${API_URL}/api/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "reefer out of Dallas under 900" }),
    });
  });
});

describe("fetchLoadEta", () => {
  it("GETs /api/loads/:id/eta", async () => {
    fetchMock.mockResolvedValue(jsonResponse(FAKE_ETA));
    await expect(fetchLoadEta(1)).resolves.toEqual(FAKE_ETA);
    expect(fetchMock).toHaveBeenCalledWith(`${API_URL}/api/loads/1/eta`);
  });
});

describe("fetchMatches", () => {
  it("sends the bearer token and no body", async () => {
    fetchMock.mockResolvedValue(jsonResponse([FAKE_LOAD]));
    await fetchMatches("tok123");
    expect(fetchMock).toHaveBeenCalledWith(`${API_URL}/api/loads/matches`, {
      headers: { Authorization: "Bearer tok123" },
    });
  });
});

describe("createLoad", () => {
  it("POSTs the payload with the bearer token", async () => {
    fetchMock.mockResolvedValue(jsonResponse(FAKE_LOAD));
    const payload: LoadCreatePayload = {
      title: "Reefer load",
      origin: "Dallas, TX",
      destination: "Houston, TX",
      equipment_type: "Reefer",
      weight_lbs: 38000,
      price_usd: 850,
    };
    await createLoad(payload, "tok123");
    expect(fetchMock).toHaveBeenCalledWith(`${API_URL}/api/loads`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer tok123" },
      body: JSON.stringify(payload),
    });
  });
});

describe("acceptLoad", () => {
  it("POSTs to /api/loads/:id/accept with the bearer token and no body", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ...FAKE_LOAD, status: "accepted" }));
    await acceptLoad(1, "tok123");
    expect(fetchMock).toHaveBeenCalledWith(`${API_URL}/api/loads/1/accept`, {
      method: "POST",
      headers: { Authorization: "Bearer tok123" },
    });
  });
});

describe("registerUser", () => {
  it("POSTs the registration payload", async () => {
    fetchMock.mockResolvedValue(jsonResponse(FAKE_AUTH));
    const payload: RegisterPayload = {
      email: "carrier@example.com",
      password: "hunter2",
      company_name: "Test Carrier Co",
      role: "carrier",
    };
    await registerUser(payload);
    expect(fetchMock).toHaveBeenCalledWith(`${API_URL}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  });

  it("throws the server's detail message on failure (e.g. duplicate email)", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: "Email already registered" }, 400));
    const payload: RegisterPayload = {
      email: "carrier@example.com",
      password: "hunter2",
      company_name: "Test Carrier Co",
      role: "carrier",
    };
    await expect(registerUser(payload)).rejects.toThrow("Email already registered");
  });
});

describe("loginUser", () => {
  it("POSTs credentials", async () => {
    fetchMock.mockResolvedValue(jsonResponse(FAKE_AUTH));
    const payload: LoginPayload = { email: "carrier@example.com", password: "hunter2" };
    await loginUser(payload);
    expect(fetchMock).toHaveBeenCalledWith(`${API_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  });

  it("throws the server's detail message on a wrong password", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: "Incorrect email or password" }, 401));
    await expect(
      loginUser({ email: "carrier@example.com", password: "wrong" }),
    ).rejects.toThrow("Incorrect email or password");
  });
});

describe("refreshAccessToken", () => {
  it("POSTs the refresh token and resolves with the new access/refresh pair", async () => {
    fetchMock.mockResolvedValue(jsonResponse(FAKE_AUTH));
    await expect(refreshAccessToken("stored-refresh-token")).resolves.toEqual(FAKE_AUTH);
    expect(fetchMock).toHaveBeenCalledWith(`${API_URL}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: "stored-refresh-token" }),
    });
  });

  it("rejects when the refresh token is dead or already rotated away", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: "Invalid refresh token" }, 401));
    await expect(refreshAccessToken("dead-token")).rejects.toThrow("Invalid refresh token");
  });
});

describe("logoutUser", () => {
  it("POSTs the refresh token to revoke it", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await logoutUser("stored-refresh-token");
    expect(fetchMock).toHaveBeenCalledWith(`${API_URL}/api/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: "stored-refresh-token" }),
    });
  });

  it("resolves even when the server responds with an error status — best-effort by design", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 500 }));
    await expect(logoutUser("stored-refresh-token")).resolves.toBeUndefined();
  });

  it("still rejects on an actual network failure", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    await expect(logoutUser("stored-refresh-token")).rejects.toThrow("network down");
  });
});
