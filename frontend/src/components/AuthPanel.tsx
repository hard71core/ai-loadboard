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
      setAuth(res.access_token, res.user);
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
          Вхід
        </button>
        <button
          type="button"
          className={`tab ${mode === "register" ? "active" : ""}`}
          onClick={() => setMode("register")}
        >
          Реєстрація
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
            Пароль
            <input
              required
              type="password"
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Мінімум 6 символів"
            />
          </label>
          {mode === "register" && (
            <>
              <label>
                Назва компанії
                <input
                  required
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Назва компанії"
                />
              </label>
              <label>
                Роль
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                >
                  <option value="shipper">Вантажовідправник</option>
                  <option value="carrier">Перевізник</option>
                </select>
              </label>
            </>
          )}
        </div>

        {error && <div className="alert">{error}</div>}

        <div className="auth-actions">
          <button className="btn primary" type="submit" disabled={submitting}>
            {submitting
              ? "Зачекайте…"
              : mode === "login"
                ? "Увійти"
                : "Зареєструватися"}
          </button>
          <button className="btn" type="button" onClick={onClose}>
            Скасувати
          </button>
        </div>
      </form>
    </div>
  );
}
