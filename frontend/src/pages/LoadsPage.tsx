import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { acceptLoad, createLoad, fetchLoads, fetchMatches, searchLoads } from "../api";
import { useAuth } from "../AuthContext";
import { STATUS_LABEL } from "../constants";
import type { Load, LoadCreatePayload } from "../types";

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

interface Props {
  openAuth: (mode: "login" | "register") => void;
}

export default function LoadsPage({ openAuth }: Props) {
  const { user, token } = useAuth();
  const navigate = useNavigate();

  const [loads, setLoads] = useState<Load[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchActive, setSearchActive] = useState(false);

  const [matchesActive, setMatchesActive] = useState(false);
  const [loadingMatches, setLoadingMatches] = useState(false);

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

  async function handleSearch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      setLoads(await searchLoads(searchQuery));
      setSearchActive(true);
      setMatchesActive(false);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSearching(false);
    }
  }

  async function clearSearch() {
    setSearchQuery("");
    setSearchActive(false);
    await loadData();
  }

  async function handleShowMatches() {
    if (!token) return;
    setLoadingMatches(true);
    try {
      setLoads(await fetchMatches(token));
      setMatchesActive(true);
      setSearchActive(false);
      setSearchQuery("");
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingMatches(false);
    }
  }

  async function clearMatches() {
    setMatchesActive(false);
    await loadData();
  }

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!user || !token) return;
    setSubmitting(true);
    try {
      const payload: LoadCreatePayload = {
        ...form,
        weight_lbs: Number(form.weight_lbs),
        price_usd: Number(form.price_usd),
      };
      await createLoad(payload, token);
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
    if (!user || !token) return;
    try {
      await acceptLoad(id, token);
      // Stay in whichever view was active instead of silently dropping back
      // to the plain list.
      if (matchesActive) {
        setLoads(await fetchMatches(token));
      } else {
        await loadData();
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const openCount = loads.filter((l) => l.status === "open").length;

  return (
    <>
      <div className="stats">
        <div className="stat">
          <div className="stat-value">{loads.length}</div>
          <div className="stat-label">Total loads</div>
        </div>
        <div className="stat">
          <div className="stat-value">{openCount}</div>
          <div className="stat-label">Open now</div>
        </div>
      </div>

      <form className="search-bar" onSubmit={handleSearch}>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search: e.g. “reefer out of Dallas under 900”"
        />
        <button className="btn primary" type="submit" disabled={searching}>
          {searching ? "Searching…" : "Search"}
        </button>
        {searchActive && (
          <button className="btn small" type="button" onClick={clearSearch}>
            Clear search
          </button>
        )}
      </form>

      <div className="toolbar">
        <h2>
          {searchActive
            ? "Search results"
            : matchesActive
              ? "Recommended for you"
              : "Available loads"}
        </h2>
        {user?.role === "carrier" &&
          (matchesActive ? (
            <button className="btn small" onClick={clearMatches}>
              Show all loads
            </button>
          ) : (
            <button className="btn primary" onClick={handleShowMatches} disabled={loadingMatches}>
              {loadingMatches ? "Finding matches…" : "★ Recommended for you"}
            </button>
          ))}
        {user?.role === "shipper" && (
          <button className="btn primary" onClick={() => setShowForm((s) => !s)}>
            {showForm ? "Cancel" : "+ Post a load"}
          </button>
        )}
        {!user && (
          <button className="btn primary" onClick={() => openAuth("register")}>
            Log in to post a load
          </button>
        )}
      </div>

      {error && <div className="alert">{error}</div>}

      {showForm && user?.role === "shipper" && (
        <form className="card form" onSubmit={handleCreate}>
          <div className="form-grid">
            <label>
              Load description
              <input
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Home appliances"
              />
            </label>
            <label>
              Origin
              <input
                required
                value={form.origin}
                onChange={(e) => setForm({ ...form, origin: e.target.value })}
                placeholder="City, state"
              />
            </label>
            <label>
              Destination
              <input
                required
                value={form.destination}
                onChange={(e) => setForm({ ...form, destination: e.target.value })}
                placeholder="City, state"
              />
            </label>
            <label>
              Equipment type
              <select
                value={form.equipment_type}
                onChange={(e) => setForm({ ...form, equipment_type: e.target.value })}
              >
                <option>Dry Van</option>
                <option>Reefer</option>
                <option>Flatbed</option>
              </select>
            </label>
            <label>
              Weight (lbs)
              <input
                required
                type="number"
                min="0"
                value={form.weight_lbs}
                onChange={(e) => setForm({ ...form, weight_lbs: e.target.value })}
              />
            </label>
            <label>
              Rate (USD)
              <input
                required
                type="number"
                min="0"
                step="0.01"
                value={form.price_usd}
                onChange={(e) => setForm({ ...form, price_usd: e.target.value })}
              />
            </label>
          </div>
          <button className="btn primary" type="submit" disabled={submitting}>
            {submitting ? "Posting…" : "Post load"}
          </button>
        </form>
      )}

      {loading ? (
        <p className="muted">Loading…</p>
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
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loads.map((load) => (
                <tr
                  key={load.id}
                  className="load-row"
                  onClick={() => navigate(`/loads/${load.id}`)}
                >
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
                    {load.carrier_name && (
                      <div className="small muted">Carrier: {load.carrier_name}</div>
                    )}
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    {load.status === "open" &&
                      (user?.role === "carrier" ? (
                        <button
                          className="btn small primary"
                          onClick={() => handleAccept(load.id)}
                        >
                          Accept load
                        </button>
                      ) : !user ? (
                        <button className="btn small" onClick={() => openAuth("register")}>
                          Log in to accept
                        </button>
                      ) : null)}
                  </td>
                </tr>
              ))}
              {loads.length === 0 && (
                <tr>
                  <td colSpan={7} className="muted">
                    No loads yet. Post the first one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
