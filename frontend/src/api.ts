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
  return handle<Load[]>(res, "Не вдалося завантажити список вантажів");
}

export async function searchLoads(query: string): Promise<Load[]> {
  const res = await fetch(`${API_URL}/api/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  return handle<Load[]>(res, "Не вдалося виконати пошук");
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
  return handle<Load>(res, "Не вдалося опублікувати вантаж");
}

export async function acceptLoad(id: number, token: string): Promise<Load> {
  const res = await fetch(`${API_URL}/api/loads/${id}/accept`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  return handle<Load>(res, "Не вдалося взяти вантаж");
}

export async function registerUser(payload: RegisterPayload): Promise<AuthResponse> {
  const res = await fetch(`${API_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handle<AuthResponse>(res, "Не вдалося зареєструватися");
}

export async function loginUser(payload: LoginPayload): Promise<AuthResponse> {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handle<AuthResponse>(res, "Не вдалося увійти");
}

export async function fetchMe(token: string): Promise<User> {
  const res = await fetch(`${API_URL}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return handle<User>(res, "Сесія недійсна");
}
