import { useEffect, useState } from "react";
import { fetchLoadEta } from "../api";
import type { Load, LoadETA } from "../types";

interface Props {
  load: Load;
}

function formatWindow(earliestIso: string, latestIso: string): string {
  const earliest = new Date(earliestIso);
  const latest = new Date(latestIso);
  const dateFmt: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const timeFmt: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };

  const earliestDate = earliest.toLocaleDateString(undefined, dateFmt);
  const earliestTime = earliest.toLocaleTimeString(undefined, timeFmt);
  const latestTime = latest.toLocaleTimeString(undefined, timeFmt);

  if (earliest.toDateString() === latest.toDateString()) {
    return `${earliestDate}, ${earliestTime}–${latestTime}`;
  }
  const latestDate = latest.toLocaleDateString(undefined, dateFmt);
  return `${earliestDate} ${earliestTime} – ${latestDate} ${latestTime}`;
}

/** "Estimated arrival" readout for an accepted/completed load — the ETA
MVP's UI surface (backend/app/core/eta.py has the heuristic). Deliberately
renders nothing for an open load: there's no accepted_at to measure an
arrival window from yet, and RouteMap already shows the plain transit-time
estimate for any load regardless of status — this panel only adds
information once there's a departure time to anchor it to. */
export default function EtaWindow({ load }: Props) {
  const [eta, setEta] = useState<LoadETA | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (load.status === "open") return;
    let cancelled = false;
    setLoading(true);
    fetchLoadEta(load.id)
      .then((result) => {
        if (!cancelled) setEta(result);
      })
      .catch(() => {
        if (!cancelled) setEta(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load.id, load.status]);

  if (load.status === "open") return null;

  const hasWindow = eta?.eta_earliest && eta?.eta_latest;

  return (
    <div className="eta-window">
      <span className="route-estimate-label">Estimated arrival</span>
      {loading ? (
        <span className="skeleton route-estimate-skeleton"></span>
      ) : hasWindow && eta ? (
        <span className="route-estimate-value">
          {formatWindow(eta.eta_earliest as string, eta.eta_latest as string)}
        </span>
      ) : (
        <span className="route-estimate-value eta-window-unavailable">
          Estimate unavailable for this lane
        </span>
      )}
      <p className="small muted eta-window-caption">
        {loading
          ? "Calculating arrival window…"
          : (eta?.basis ??
            "Live routing data is temporarily unavailable for this lane.")}
      </p>
    </div>
  );
}
