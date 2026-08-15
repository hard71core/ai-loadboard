import { FormEvent, useEffect, useState } from "react";
import { acceptLoad, createLoad, fetchLoads } from "./api";
import { useAuth } from "./AuthContext";
import AuthPanel from "./components/AuthPanel";
import type { Load, LoadCreatePayload, LoadStatus } from "./types";

const STATUS_LABEL: Record<LoadStatus, string> = {
  open: "Відкрито",
  accepted: "Взято",
  completed: "Завершено",
};

const ROLE_LABEL = {
  shipper: "Вантажовідправник",
  carrier: "Перевізник",
};

interface FormState {
  title: string;
  origin: string;
  destination: string;
  equipment_type: string;
  weight_lbs: string;
  price_usd: string;
}

const EMPTY_FORM: FormState = {
  title: "",
  origin: "",
  destination: "",
  equipment_type: "Dry Van",
  weight_lbs: "",
  price_usd: "",
};

export default function App() {
  const { user, loading: authLoading, logout } = useAuth();

  const [loads, setLoads] = useState<Load[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      setLoads(await fetchLoads());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function openAuth(mode: "login" | "register") {
    setAuthMode(mode);
    setShowAuth(true);
  }

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);
    try {
      const payload: LoadCreatePayload = {
        ...form,
        weight_lbs: Number(form.weight_lbs),
        price_usd: Number(form.price_usd),
        shipper_name: user.company_name,
      };
      await createLoad(payload);
      setForm(EMPTY_FORM);
      setShowForm(false);
      await loadData();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAccept(id: number) {
    if (!user) return;
    try {
      await acceptLoad(id, user.company_name);
      await loadData();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const openCount = loads.filter((l) => l.status === "open").length;

  return (
    <div className="page">
      <header className="hero">
        <div className="hero-top">
          <div className="brand">AI&nbsp;Loadboard</div>
          <div className="auth-status">
            {authLoading ? null : user ? (
              <>
                <span className="user-badge">
                  {user.company_name} · {ROLE_LABEL[user.role]}
                </span>
                <button className="btn small" onClick={logout}>
                  Вийти
                </button>
              </>
            ) : (
              <>
                <button className="btn small" onClick={() => openAuth("login")}>
                  Увійти
                </button>
                <button
                  className="btn small primary"
                  onClick={() => openAuth("register")}
                >
                  Реєстрація
                </button>
              </>
            )}
          </div>
        </div>
        <p className="tagline">
          Logistic is easy
        </p>
      </header>

      <main className="container">
        {showAuth && (
          <AuthPanel
            initialMode={authMode}
            onClose={() => setShowAuth(false)}
          />
        )}

        <div className="stats">
          <div className="stat">
            <div className="stat-value">{loads.length}</div>
            <div className="stat-label">Всього вантажів</div>
          </div>
          <div className="stat">
            <div className="stat-value">{openCount}</div>
            <div className="stat-label">Відкрито зараз</div>
          </div>
        </div>

        <div className="toolbar">
          <h2>Доступні вантажі</h2>
          {user?.role === "shipper" && (
            <button className="btn primary" onClick={() => setShowForm((s) => !s)}>
              {showForm ? "Скасувати" : "+ Опублікувати вантаж"}
            </button>
          )}
          {!user && (
            <button className="btn primary" onClick={() => openAuth("register")}>
              Увійти, щоб опублікувати вантаж
            </button>
          )}
        </div>

        {error && <div className="alert">{error}</div>}

        {showForm && user?.role === "shipper" && (
          <form className="card form" onSubmit={handleCreate}>
            <div className="form-grid">
              <label>
                Опис вантажу
                <input
                  required
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Напр. Побутова техніка"
                />
              </label>
              <label>
                Звідки
                <input
                  required
                  value={form.origin}
                  onChange={(e) => setForm({ ...form, origin: e.target.value })}
                  placeholder="Місто, штат"
                />
              </label>
              <label>
                Куди
                <input
                  required
                  value={form.destination}
                  onChange={(e) =>
                    setForm({ ...form, destination: e.target.value })
                  }
                  placeholder="Місто, штат"
                />
              </label>
              <label>
                Тип кузова
                <select
                  value={form.equipment_type}
                  onChange={(e) =>
                    setForm({ ...form, equipment_type: e.target.value })
                  }
                >
                  <option>Dry Van</option>
                  <option>Reefer</option>
                  <option>Flatbed</option>
                </select>
              </label>
              <label>
                Вага (lbs)
                <input
                  required
                  type="number"
                  min="0"
                  value={form.weight_lbs}
                  onChange={(e) =>
                    setForm({ ...form, weight_lbs: e.target.value })
                  }
                />
              </label>
              <label>
                Ставка (USD)
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.price_usd}
                  onChange={(e) =>
                    setForm({ ...form, price_usd: e.target.value })
                  }
                />
              </label>
            </div>
            <button className="btn primary" type="submit" disabled={submitting}>
              {submitting ? "Публікуємо…" : "Опублікувати вантаж"}
            </button>
          </form>
        )}

        {loading ? (
          <p className="muted">Завантаження…</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Маршрут</th>
                  <th>Кузов</th>
                  <th>Вага</th>
                  <th>Ставка</th>
                  <th>Відправник</th>
                  <th>Статус</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {loads.map((load) => (
                  <tr key={load.id}>
                    <td>
                      <b>{load.origin}</b> → <b>{load.destination}</b>
                      <div className="small muted">{load.title}</div>
                    </td>
                    <td>{load.equipment_type}</td>
                    <td>{load.weight_lbs.toLocaleString()} lbs</td>
                    <td>${Number(load.price_usd).toFixed(2)}</td>
                    <td>{load.shipper_name}</td>
                    <td>
                      <span className={`badge ${load.status}`}>
                        {STATUS_LABEL[load.status]}
                      </span>
                      {load.carrier_name && (
                        <div className="small muted">
                          Перевізник: {load.carrier_name}
                        </div>
                      )}
                    </td>
                    <td>
                      {load.status === "open" &&
                        (user?.role === "carrier" ? (
                          <button
                            className="btn small primary"
                            onClick={() => handleAccept(load.id)}
                          >
                            Взяти вантаж
                          </button>
                        ) : !user ? (
                          <button
                            className="btn small"
                            onClick={() => openAuth("register")}
                          >
                            Увійти, щоб взяти
                          </button>
                        ) : null)}
                    </td>
                  </tr>
                ))}
                {loads.length === 0 && (
                  <tr>
                    <td colSpan={7} className="muted">
                      Поки що немає вантажів. Опублікуйте перший.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
