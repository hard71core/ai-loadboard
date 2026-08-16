import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { acceptLoad, fetchLoad } from "../api";
import { useAuth } from "../AuthContext";
import RouteMap from "../components/RouteMap";
import { STATUS_LABEL } from "../constants";
import type { Load } from "../types";

interface Props {
  openAuth: (mode: "login" | "register") => void;
}

export default function LoadDetailPage({ openAuth }: Props) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, token } = useAuth();

  const [load, setLoad] = useState<Load | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);

  const loadDetail = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      setLoad(await fetchLoad(Number(id)));
      setLoadError(null);
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  async function handleAccept() {
    if (!user || !token || !load) return;
    setAccepting(true);
    try {
      await acceptLoad(load.id, token);
      setActionError(null);
      await loadDetail();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setAccepting(false);
    }
  }

  if (loading) {
    return (
      <div className="container">
        <div className="load-detail">
          <div className="skeleton" style={{ width: 120, height: 32 }}></div>
          <div className="card load-detail-card">
            <div className="skeleton" style={{ width: "60%", height: 28, marginBottom: 20 }}></div>
            <div className="skeleton" style={{ width: "30%", height: 16 }}></div>
          </div>
        </div>
      </div>
    );
  }

  if (loadError || !load) {
    return (
      <div className="container">
        <div className="load-detail">
          <Link className="btn small" to="/">
            ← Back to loads
          </Link>
          <div className="alert">{loadError || "Load not found."}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="load-detail">
        <Link className="btn small" to="/">
          ← Back to loads
        </Link>

        <div className="card load-detail-card">
          <div className="load-detail-header">
            <h2>
              {load.origin} → {load.destination}
            </h2>
            <span className={`badge ${load.status}`}>{STATUS_LABEL[load.status]}</span>
          </div>
          <p className="muted">{load.title}</p>

          <RouteMap origin={load.origin} destination={load.destination} />

          <dl className="load-detail-grid">
            <div>
              <dt>Equipment type</dt>
              <dd>{load.equipment_type}</dd>
            </div>
            <div>
              <dt>Weight</dt>
              <dd>{load.weight_lbs.toLocaleString()} lbs</dd>
            </div>
            <div>
              <dt>Rate</dt>
              <dd>${Number(load.price_usd).toFixed(2)}</dd>
            </div>
            <div>
              <dt>Shipper</dt>
              <dd>{load.shipper_name}</dd>
            </div>
            {load.carrier_name && (
              <div>
                <dt>Carrier</dt>
                <dd>{load.carrier_name}</dd>
              </div>
            )}
            <div>
              <dt>Posted</dt>
              <dd>{new Date(load.created_at).toLocaleString()}</dd>
            </div>
          </dl>

          {actionError && <div className="alert">{actionError}</div>}

          {load.status === "open" &&
            (user?.role === "carrier" ? (
              <button className="btn primary" onClick={handleAccept} disabled={accepting}>
                {accepting ? "Accepting…" : "Accept load"}
              </button>
            ) : !user ? (
              <button className="btn primary" onClick={() => openAuth("register")}>
                Log in to accept
              </button>
            ) : null)}

          {load.status !== "open" && (
            <button className="btn small" onClick={() => navigate("/")}>
              ← Back to loads
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
