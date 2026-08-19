import type {
  AuthResponse,
  Load,
  LoadCreatePayload,
  LoadETA,
  LoadStatus,
  LoginPayload,
  PaginatedLoads,
  ProfileUpdatePayload,
  RegisterPayload,
  User,
} from "./types";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

async function handle<T>(res: Response, fallbackMessage: string): Promise<T> {
  if (!res.ok) {
    let detail = fallbackMessage;
    try {
      const body = await res.json();
      detail = body.detail || fallbackMessage;
    } catch {
      // response had no JSON body — keep the fallback message
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

/** Only the plain-list browsing view on LoadsPage.tsx (and HomePage.tsx's
hero stats) call this — searchLoads/fetchMatches below stay full-array
responses, unpaginated, deliberately out of scope for this MVP (see
backend/app/schemas.py's PaginatedLoads docstring). Builds the query
string only from params actually passed, so a plain `fetchLoads()` still
hits `/api/loads` with no query string at all rather than sending the
backend's defaults explicitly. */
export async function fetchLoads(params?: {
  status?: LoadStatus;
  page?: number;
  pageSize?: number;
}): Promise<PaginatedLoads> {
  const query = new URLSearchParams();
  if (params?.status) query.set("status", params.status);
  if (params?.page !== undefined) query.set("page", String(params.page));
  if (params?.pageSize !== undefined) query.set("page_size", String(params.pageSize));
  const qs = query.toString();
  const res = await fetch(`${API_URL}/api/loads${qs ? `?${qs}` : ""}`);
  return handle<PaginatedLoads>(res, "Failed to load the load list");
}

export async function fetchLoad(id: number): Promise<Load> {
  const res = await fetch(`${API_URL}/api/loads/${id}`);
  return handle<Load>(res, "Failed to load the load details");
}

export async function searchLoads(query: string): Promise<Load[]> {
  const res = await fetch(`${API_URL}/api/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  return handle<Load[]>(res, "Search failed");
}

export async function fetchLoadEta(id: number): Promise<LoadETA> {
  const res = await fetch(`${API_URL}/api/loads/${id}/eta`);
  return handle<LoadETA>(res, "Failed to load the arrival estimate");
}

export async function fetchMatches(token: string): Promise<Load[]> {
  const res = await fetch(`${API_URL}/api/loads/matches`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return handle<Load[]>(res, "Failed to load recommended loads");
}

/** Every load the caller shows up on, either side — posted as shipper or
accepted as carrier, any status. Backs the personal-cabinet page. */
export async function fetchMyLoads(token: string): Promise<Load[]> {
  const res = await fetch(`${API_URL}/api/loads/mine`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return handle<Load[]>(res, "Failed to load your loads");
}

export async function createLoad(
  payload: LoadCreatePayload,
  token: string,
): Promise<Load> {
  const res = await fetch(`${API_URL}/api/loads`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  return handle<Load>(res, "Failed to post the load");
}

export async function acceptLoad(id: number, token: string): Promise<Load> {
  const res = await fetch(`${API_URL}/api/loads/${id}/accept`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  return handle<Load>(res, "Failed to accept the load");
}

export async function updateProfile(payload: ProfileUpdatePayload, token: string): Promise<User> {
  const res = await fetch(`${API_URL}/api/auth/me`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  return handle<User>(res, "Failed to update your profile");
}

export async function registerUser(payload: RegisterPayload): Promise<AuthResponse> {
  const res = await fetch(`${API_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handle<AuthResponse>(res, "Sign-up failed");
}

export async function loginUser(payload: LoginPayload): Promise<AuthResponse> {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handle<AuthResponse>(res, "Log in failed");
}

/** Exchanges a still-valid refresh token for a new access/refresh pair —
the response already includes the current user, so callers don't need a
separate /api/auth/me round trip (AuthContext.tsx uses this for both the
page-load bootstrap and the silent background refresh). Rejects (instead of
throwing a generic Error) on a 401 so AuthContext can tell "refresh token is
dead, log the user out" apart from a transient network failure. */
export async function refreshAccessToken(refreshToken: string): Promise<AuthResponse> {
  const res = await fetch(`${API_URL}/api/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  return handle<AuthResponse>(res, "Session refresh failed");
}

/** Best-effort — revokes the refresh token server-side so it can't be
replayed later, but the caller (AuthContext.tsx's logout()) clears local
state either way, so a network failure here shouldn't block logging out. */
export async function logoutUser(refreshToken: string): Promise<void> {
  await fetch(`${API_URL}/api/auth/logout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
}
