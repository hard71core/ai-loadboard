import { FormEvent, useState } from "react";
import { loginUser, registerUser } from "../api";
import { useAuth } from "../AuthContext";
import type { UserRole } from "../types";

interface Props {
  onClose: () => void;
  initialMode?: "login" | "register";
}

export default function AuthPanel({ onClose, initialMode = "login" }: Props) {
  const { setAuth } = useAuth();
  const [mode, setMode] = useState<"login" | "register">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [role, setRole] = useState<UserRole>("shipper");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res =
        mode === "login"
          ? await loginUser({ email, password })
          : await registerUser({
              email,
              password,
              company_name: companyName,
              role,
            });
      setAuth(res);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card form auth-panel">
      <div className="auth-tabs">
        <button
          type="button"
          className={`tab ${mode === "login" ? "active" : ""}`}
          onClick={() => setMode("login")}
        >
          Log in
        </button>
        <button
          type="button"
          className={`tab ${mode === "register" ? "active" : ""}`}
          onClick={() => setMode("register")}
        >
          Sign up
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <label>
            Email
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
            />
          </label>
          <label>
            Password
            <input
              required
              type="password"
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
            />
          </label>
          {mode === "register" && (
            <>
              <label>
                Company name
                <input
                  required
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Company name"
                />
              </label>
              <label>
                Role
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                >
                  <option value="shipper">Shipper</option>
                  <option value="carrier">Carrier</option>
                </select>
              </label>
            </>
          )}
        </div>

        {error && <div className="alert">{error}</div>}

        <div className="auth-actions">
          <button className="btn primary" type="submit" disabled={submitting}>
            {submitting
              ? "Please wait…"
              : mode === "login"
                ? "Log in"
                : "Sign up"}
          </button>
          <button className="btn" type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
