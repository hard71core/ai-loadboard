import type {
  AuthResponse,
  Load,
  LoadCreatePayload,
  LoginPayload,
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

export async function fetchLoads(): Promise<Load[]> {
  const res = await fetch(`${API_URL}/api/loads`);
  return handle<Load[]>(res, "Failed to load the load list");
}

export async function searchLoads(query: string): Promise<Load[]> {
  const res = await fetch(`${API_URL}/api/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  return handle<Load[]>(res, "Search failed");
}

export async function fetchMatches(token: string): Promise<Load[]> {
  const res = await fetch(`${API_URL}/api/loads/matches`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return handle<Load[]>(res, "Failed to load recommended loads");
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

export async function fetchMe(token: string): Promise<User> {
  const res = await fetch(`${API_URL}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return handle<User>(res, "Session is invalid");
}
