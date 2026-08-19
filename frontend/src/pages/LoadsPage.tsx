import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { acceptLoad, createLoad, fetchLoads, fetchMatches, searchLoads } from "../api";
import { useAuth } from "../AuthContext";
import Combobox from "../components/Combobox";
import { STATUS_LABEL } from "../constants";
import { SparkleIcon } from "../icons";
import { searchPlaces } from "../placeSearch";
import type { Load, LoadCreatePayload } from "../types";
import { US_CITIES } from "../usCities";
import { US_STATES } from "../usLocations";

interface FormState {
  title: string;
  equipment_type: string;
  weight_lbs: string;
  price_usd: string;
}

const EMPTY_FORM: FormState = {
  title: "",
  equipment_type: "Dry Van",
  weight_lbs: "",
  price_usd: "",
};

interface LocationValue {
  state: string;
  city: string;
}

const EMPTY_LOCATION: LocationValue = { state: "", city: "" };

/** State + city as two searchable comboboxes rather than a free-text field
— picking a real place from search results guarantees every posted load's
origin/destination is a "City, ST" pair that geocode.ts and core/eta.py's
Nominatim calls can always resolve, instead of a typo silently breaking the
map/ETA later. The state list is fixed (usLocations.ts, 51 entries, no
network call); the city list is a live, debounced search scoped to
whichever state is already picked (placeSearch.ts, backed by Photon rather
than Nominatim — see that file's docstring for why) — every real city,
town, or village it knows about, not just a handful of the largest
metros. On focus, before any text is typed, it instead shows a small
curated list for the selected state (usCities.ts, ~5 well-known cities) —
Photon has no "browse this state" mode that works without a search term
(see usCities.ts's docstring), so this static list is what fills that
zero-input moment; the instant the user types even one character, live
Photon search takes over exactly as before. */
function LocationFields({
  legend,
  value,
  onChange,
}: {
  legend: string;
  value: LocationValue;
  onChange: (value: LocationValue) => void;
}) {
  const stateName = US_STATES.find((s) => s.code === value.state)?.name ?? "";

  return (
    <>
      <label>
        {legend} — state
        <Combobox
          placeholder="Search states…"
          value={stateName}
          search={(query) => {
            const q = query.trim().toLowerCase();
            const matches = q
              ? US_STATES.filter((s) => s.name.toLowerCase().includes(q))
              : US_STATES;
            return matches.map((s) => ({ value: s.code, label: s.name }));
          }}
          onSelect={(option) => onChange({ state: option.value, city: "" })}
        />
      </label>
      <label>
        {legend} — city
        <Combobox
          placeholder="Search cities, towns, villages…"
          disabledPlaceholder="Select a state first"
          disabled={!value.state}
          value={value.city}
          minChars={0}
          debounceMs={350}
          search={async (query) => {
            if (!query.trim()) {
              return (US_CITIES[value.state] ?? []).map((city) => ({
                value: `${city}, ${value.state}`,
                label: city,
              }));
            }
            const places = await searchPlaces(query, stateName, value.state);
            return places.map((p) => ({ value: `${p.city}, ${p.stateCode}`, label: p.city }));
          }}
          onSelect={(option) => onChange({ ...value, city: option.label })}
        />
      </label>
    </>
  );
}

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
  const [origin, setOrigin] = useState<LocationValue>(EMPTY_LOCATION);
  const [destination, setDestination] = useState<LocationValue>(EMPTY_LOCATION);
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
    // Combobox is a plain text input, not a <select> — the browser's native
    // `required` validation doesn't cover "did they actually pick a real
    // option, not just type something and tab away". Check explicitly.
    if (!origin.state || !origin.city || !destination.state || !destination.city) {
      setError("Pick an origin and destination from the search results, not just typed text.");
      return;
    }
    setSubmitting(true);
    try {
      const payload: LoadCreatePayload = {
        ...form,
        origin: `${origin.city}, ${origin.state}`,
        destination: `${destination.city}, ${destination.state}`,
        weight_lbs: Number(form.weight_lbs),
        price_usd: Number(form.price_usd),
      };
      await createLoad(payload, token);
      setForm(EMPTY_FORM);
      setOrigin(EMPTY_LOCATION);
      setDestination(EMPTY_LOCATION);
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

  return (
    <>
      <div className="page-header">
        <div className="page-header-inner">
          <h1>Loads</h1>
          <p className="muted">
            Browse open freight, search it in plain English, or let matching
            rank it against your own history.
          </p>
        </div>
      </div>

      <div className="container">
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
                <SparkleIcon />
                {loadingMatches ? "Finding matches…" : "Recommended for you"}
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
              <LocationFields legend="Origin" value={origin} onChange={setOrigin} />
              <LocationFields legend="Destination" value={destination} onChange={setDestination} />
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
          <div className="table-wrap skeleton-table">
            {Array.from({ length: 5 }).map((_, i) => (
              <div className="skeleton-row" key={i}>
                <div className="skeleton"></div>
                <div className="skeleton"></div>
                <div className="skeleton"></div>
                <div className="skeleton"></div>
              </div>
            ))}
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
      </div>
    </>
  );
}
