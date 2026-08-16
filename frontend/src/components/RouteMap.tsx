import L from "leaflet";
import { useEffect, useState } from "react";
import { MapContainer, Polyline, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import { geocodeLocation, haversineMiles, type Coordinates } from "../geocode";
import { fetchDrivingRoute, type DrivingRoute } from "../routing";

interface Props {
  origin: string;
  destination: string;
}

const originIcon = L.divIcon({
  className: "route-marker route-marker-origin",
  html: "<span></span>",
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

const destinationIcon = L.divIcon({
  className: "route-marker route-marker-destination",
  html: "<span></span>",
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

type LoadState = "loading" | "ready" | "unavailable";

/** react-leaflet v4's <MapContainer> only reads its bounds/center/zoom
props once, at mount — it doesn't re-fit when they change later. Since the
driving route arrives after the map's already showing (progressive
enhancement: markers + straight line first, then the real road path once
OSRM responds), the view needs to react to that. This is the standard
react-leaflet pattern for it: a child that calls the imperative API. */
function FitBounds({ bounds }: { bounds: L.LatLngBounds }) {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(bounds, { padding: [36, 36] });
  }, [map, bounds]);
  return null;
}

function formatDuration(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.round(totalMinutes % 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export default function RouteMap({ origin, destination }: Props) {
  const [state, setState] = useState<LoadState>("loading");
  const [originCoords, setOriginCoords] = useState<Coordinates | null>(null);
  const [destCoords, setDestCoords] = useState<Coordinates | null>(null);
  const [route, setRoute] = useState<DrivingRoute | null>(null);
  const [routeLoading, setRouteLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    setRoute(null);
    setRouteLoading(true);

    (async () => {
      const [o, d] = await Promise.all([geocodeLocation(origin), geocodeLocation(destination)]);
      if (cancelled) return;
      if (!o || !d) {
        setState("unavailable");
        setRouteLoading(false);
        return;
      }
      setOriginCoords(o);
      setDestCoords(d);
      setState("ready");

      const driving = await fetchDrivingRoute(o, d);
      if (!cancelled) {
        setRoute(driving);
        setRouteLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [origin, destination]);

  if (state === "loading") {
    return <div className="route-map skeleton" aria-label="Loading map…"></div>;
  }

  if (state === "unavailable" || !originCoords || !destCoords) {
    return (
      <div className="route-map route-map-unavailable">
        <p className="muted small">Map preview isn't available for this route right now.</p>
      </div>
    );
  }

  const straightLineMiles = haversineMiles(originCoords, destCoords);
  const fallbackPath: [number, number][] = [
    [originCoords.lat, originCoords.lng],
    [destCoords.lat, destCoords.lng],
  ];
  const bounds = L.latLngBounds(route ? route.path : fallbackPath);
  const distanceMiles = route ? route.distanceMiles : straightLineMiles;

  return (
    <div className="route-map-wrap">
      <div className="route-map">
        <MapContainer
          center={[originCoords.lat, originCoords.lng]}
          zoom={6}
          scrollWheelZoom={false}
          attributionControl={true}
          style={{ height: "100%", width: "100%" }}
        >
          <FitBounds bounds={bounds} />
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          />
          <Marker position={[originCoords.lat, originCoords.lng]} icon={originIcon}>
            <Popup>{origin}</Popup>
          </Marker>
          <Marker position={[destCoords.lat, destCoords.lng]} icon={destinationIcon}>
            <Popup>{destination}</Popup>
          </Marker>
          {/* A wider white halo underneath makes the accent line legible
          against Voyager's busier, colorful basemap. Solid once it's a
          real road path; dashed while it's still the straight-line
          fallback, so the two look visibly different. */}
          <Polyline positions={route ? route.path : fallbackPath} pathOptions={{ color: "#ffffff", weight: 6, opacity: 0.85 }} />
          <Polyline
            positions={route ? route.path : fallbackPath}
            pathOptions={
              route
                ? // Leaflet's setStyle() merges into the previous style
                  // rather than replacing it, so dashArray must be
                  // explicitly cleared here — otherwise the fallback
                  // render's "7 9" from before the route arrived lingers
                  // on the now-solid line.
                  { color: "#0fa87a", weight: 4, dashArray: undefined }
                : { color: "#0fa87a", weight: 3, dashArray: "7 9" }
            }
          />
        </MapContainer>
      </div>

      <div className="route-estimate">
        <div className="route-estimate-item">
          <span className="route-estimate-label">Distance</span>
          {routeLoading ? (
            <span className="skeleton route-estimate-skeleton"></span>
          ) : (
            <span className="route-estimate-value">
              {Math.round(distanceMiles).toLocaleString()} mi
            </span>
          )}
        </div>
        <div className="route-estimate-item">
          <span className="route-estimate-label">Est. drive time</span>
          {routeLoading ? (
            <span className="skeleton route-estimate-skeleton"></span>
          ) : (
            <span className="route-estimate-value">
              {route ? formatDuration(route.durationMinutes) : "—"}
            </span>
          )}
        </div>
      </div>

      <p className="route-map-caption small muted">
        {routeLoading
          ? "Calculating the driving route…"
          : route
            ? "Driving route via OSRM — a general driving-time estimate, not adjusted for truck routing, hours-of-service limits, or live traffic."
            : `Live routing is temporarily unavailable — showing the ~${Math.round(straightLineMiles).toLocaleString()} mi straight-line distance instead, not turn-by-turn directions.`}
      </p>
    </div>
  );
}
