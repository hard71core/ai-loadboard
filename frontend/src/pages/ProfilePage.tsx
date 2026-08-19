import { FormEvent, useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchMyLoads, updateProfile } from "../api";
import { useAuth } from "../AuthContext";
import { ROLE_LABEL, STATUS_LABEL } from "../constants";
import { BoltIcon, ClockIcon, ShieldIcon } from "../icons";
import type { Load } from "../types";

interface Props {
  openAuth: (mode: "login" | "register") => void;
}

/** "/profile" — the personal cabinet: the caller's own profile (read-only
except for company_name, the one self-editable field — see the backend's
schemas.UserUpdate docstring for why email/role aren't) plus every load
they show up on, either side (posted as shipper, accepted as carrier),
via GET /api/loads/mine. Reachable from the header's account badge
(App.tsx). */
export default function ProfilePage({ openAuth }: Props) {
  const { user, token, updateUser } = useAuth();
  const navigate = useNavigate();

  const [loads, setLoads] = useState<Load[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [companyName, setCompanyName] = useState(user?.company_name ?? "");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadMine = useCallback(async () => {
    if (!token) return;
    try {
      setLoading(true);
      setLoads(await fetchMyLoads(token));
      setLoadError(null);
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadMine();
  }, [loadMine]);

  function startEditing() {
    setCompanyName(user?.company_name ?? "");
    setSaveError(null);
    setEditing(true);
  }

  async function handleSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!token) return;
    setSaving(true);
    setSaveError(null);
    try {
      updateUser(await updateProfile({ company_name: companyName }, token));
      setEditing(false);
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!user) {
    return (
      <div className="container">
        <div className="page-header">
          <div className="page-header-inner">
            <h1>My account</h1>
          </div>
        </div>
        <div className="card">
          <p className="muted">Log in to see your profile and your loads.</p>
          <button className="btn primary" onClick={() => openAuth("login")}>
            Log in
          </button>
        </div>
      </div>
    );
  }

  const openCount = loads.filter((l) => l.status === "open").length;
  const acceptedCount = loads.filter((l) => l.status === "accepted").length;
  const completedCount = loads.filter((l) => l.status === "completed").length;

  return (
    <>
      <div className="page-header">
        <div className="page-header-inner">
          <h1>My account</h1>
          <p className="muted">Your profile, and every load you've posted or accepted.</p>
        </div>
      </div>

      <div className="container">
        <div className="card">
          {editing ? (
            <form className="form" onSubmit={handleSave}>
              <div className="form-grid">
                <label>
                  Company name
                  <input
                    required
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                  />
                </label>
              </div>
              {saveError && <div className="alert">{saveError}</div>}
              <div className="auth-actions">
                <button className="btn primary" type="submit" disabled={saving}>
                  {saving ? "Saving…" : "Save"}
                </button>
                <button className="btn" type="button" onClick={() => setEditing(false)}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <>
              <dl className="load-detail-grid">
                <div>
                  <dt>Company</dt>
                  <dd>{user.company_name}</dd>
                </div>
                <div>
                  <dt>Email</dt>
                  <dd>{user.email}</dd>
                </div>
                <div>
                  <dt>Role</dt>
                  <dd>{ROLE_LABEL[user.role]}</dd>
                </div>
              </dl>
              <button className="btn small" onClick={startEditing}>
                Edit company name
              </button>
            </>
          )}
        </div>

        <div className="profile-stats">
          <div className="stat">
            <span className="stat-icon">
              <BoltIcon />
            </span>
            <div>
              <div className="stat-value">{openCount}</div>
              <div className="stat-label">Open</div>
            </div>
          </div>
          <div className="stat">
            <span className="stat-icon">
              <ClockIcon />
            </span>
            <div>
              <div className="stat-value">{acceptedCount}</div>
              <div className="stat-label">Accepted</div>
            </div>
          </div>
          <div className="stat">
            <span className="stat-icon">
              <ShieldIcon />
            </span>
            <div>
              <div className="stat-value">{completedCount}</div>
              <div className="stat-label">Completed</div>
            </div>
          </div>
        </div>

        <h2>My loads</h2>

        {loadError && <div className="alert">{loadError}</div>}

        {loading ? (
          <div className="table-wrap skeleton-table">
            {Array.from({ length: 3 }).map((_, i) => (
              <div className="skeleton-row" key={i}>
                <div className="skeleton"></div>
                <div className="skeleton"></div>
                <div className="skeleton"></div>
                <div className="skeleton"></div>
              </div>
            ))}
          </div>
        ) : loads.length === 0 ? (
          <div className="card">
            <p className="muted">
              {user.role === "shipper"
                ? "You haven't posted any loads yet."
                : "You haven't accepted any loads yet."}
            </p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Route</th>
                  <th>Equipment</th>
                  <th>Weight</th>
                  <th>Rate</th>
                  <th>Shipper</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {loads.map((load) => (
                  <tr key={load.id} className="load-row" onClick={() => navigate(`/loads/${load.id}`)}>
                    <td>
                      <b>{load.origin}</b> → <b>{load.destination}</b>
                      <div className="small muted">{load.title}</div>
                    </td>
                    <td>{load.equipment_type}</td>
                    <td>{load.weight_lbs.toLocaleString()} lbs</td>
                    <td>${Number(load.price_usd).toFixed(2)}</td>
                    <td>{load.shipper_name}</td>
                    <td>
                      <span className={`badge ${load.status}`}>{STATUS_LABEL[load.status]}</span>
                      {load.carrier_name && <div className="small muted">Carrier: {load.carrier_name}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
