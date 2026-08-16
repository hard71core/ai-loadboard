import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { logoutUser, refreshAccessToken } from "./api";
import type { AuthResponse, User } from "./types";

interface AuthContextValue {
  user: User | null;
  token: string | null;
  loading: boolean;
  setAuth: (auth: AuthResponse) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const ACCESS_TOKEN_KEY = "ai_loadboard_token";
const REFRESH_TOKEN_KEY = "ai_loadboard_refresh_token";

// Refresh a bit before the access token actually expires, not exactly at
// the deadline — a request that starts just as the token dies would
// otherwise 401 for no user-visible reason.
const REFRESH_BUFFER_MS = 30_000;
const MIN_REFRESH_DELAY_MS = 5_000;

/** Reads the `exp` claim out of a JWT's payload without verifying the
signature — this never has to be trustworthy, it's only used to schedule
*when* to ask the server for a fresh token; the server is still the one
actually enforcing expiry on every request. Returns null on anything
unexpected (malformed token, missing/non-numeric exp) rather than throwing,
since the caller's fallback (a short fixed delay) is a perfectly fine
default for "couldn't figure out exactly when this expires". */
function decodeJwtExpiryMs(accessToken: string): number | null {
  try {
    const payloadSegment = accessToken.split(".")[1];
    const payload = JSON.parse(atob(payloadSegment));
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearScheduledRefresh() {
    if (refreshTimer.current) {
      clearTimeout(refreshTimer.current);
      refreshTimer.current = null;
    }
  }

  function applyAuth(auth: AuthResponse) {
    localStorage.setItem(ACCESS_TOKEN_KEY, auth.access_token);
    localStorage.setItem(REFRESH_TOKEN_KEY, auth.refresh_token);
    setToken(auth.access_token);
    setUser(auth.user);
    scheduleRefresh(auth.access_token, auth.refresh_token);
  }

  function clearAuth() {
    clearScheduledRefresh();
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    setToken(null);
    setUser(null);
  }

  function scheduleRefresh(accessToken: string, refreshToken: string) {
    clearScheduledRefresh();
    const expiryMs = decodeJwtExpiryMs(accessToken);
    const delay = expiryMs
      ? Math.max(MIN_REFRESH_DELAY_MS, expiryMs - Date.now() - REFRESH_BUFFER_MS)
      : MIN_REFRESH_DELAY_MS;

    refreshTimer.current = setTimeout(async () => {
      try {
        applyAuth(await refreshAccessToken(refreshToken));
      } catch {
        // The refresh token is dead (expired, revoked, or already rotated
        // away by another tab) — nothing left to do but sign the user out.
        clearAuth();
      }
    }, delay);
  }

  useEffect(() => {
    const storedRefreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!storedRefreshToken) {
      setLoading(false);
      return;
    }
    refreshAccessToken(storedRefreshToken)
      .then(applyAuth)
      .catch(() => clearAuth())
      .finally(() => setLoading(false));

    return clearScheduledRefresh;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bootstrap runs once on mount
  }, []);

  function setAuth(auth: AuthResponse) {
    applyAuth(auth);
  }

  function logout() {
    const storedRefreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (storedRefreshToken) {
      logoutUser(storedRefreshToken).catch(() => {
        // Best-effort revocation — local state is cleared below regardless,
        // so a network hiccup here doesn't strand the user "logged in".
      });
    }
    clearAuth();
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, setAuth, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
