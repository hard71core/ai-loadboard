import L from "leaflet";
import { useEffect, useState } from "react";
import { MapContainer, Polyline, TileLayer, Marker, Popup } from "react-leaflet";
import { geocodeLocation, haversineMiles, type Coordinates } from "../geocode";

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

export default function RouteMap({ origin, destination }: Props) {
  const [state, setState] = useState<LoadState>("loading");
  const [originCoords, setOriginCoords] = useState<Coordinates | null>(null);
  const [destCoords, setDestCoords] = useState<Coordinates | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState("loading");

    Promise.all([geocodeLocation(origin), geocodeLocation(destination)]).then(([o, d]) => {
      if (cancelled) return;
      if (!o || !d) {
        setState("unavailable");
        return;
      }
      setOriginCoords(o);
      setDestCoords(d);
      setState("ready");
    });

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

  const bounds = L.latLngBounds(
    [originCoords.lat, originCoords.lng],
    [destCoords.lat, destCoords.lng],
  );
  const miles = Math.round(haversineMiles(originCoords, destCoords));

  return (
    <div className="route-map-wrap">
      <div className="route-map">
        <MapContainer
          bounds={bounds}
          boundsOptions={{ padding: [36, 36] }}
          scrollWheelZoom={false}
          attributionControl={true}
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          />
          <Marker position={[originCoords.lat, originCoords.lng]} icon={originIcon}>
            <Popup>{origin}</Popup>
          </Marker>
          <Marker position={[destCoords.lat, destCoords.lng]} icon={destinationIcon}>
            <Popup>{destination}</Popup>
          </Marker>
          <Polyline
            positions={[
              [originCoords.lat, originCoords.lng],
              [destCoords.lat, destCoords.lng],
            ]}
            pathOptions={{ color: "#17e0a3", weight: 3, dashArray: "7 9" }}
          />
        </MapContainer>
      </div>
      <p className="route-map-caption small muted">
        ~{miles.toLocaleString()} mi straight-line — an approximate route, not turn-by-turn
        directions.
      </p>
    </div>
  );
}
