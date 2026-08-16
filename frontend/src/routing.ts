import type { Coordinates } from "./geocode";

export interface DrivingRoute {
  /** [lat, lng] pairs following the actual road network, in the order
  Leaflet's <Polyline> expects. */
  path: [number, number][];
  distanceMiles: number;
  durationMinutes: number;
}

const cache = new Map<string, DrivingRoute | null>();

/** Free, keyless turn-by-turn driving directions via OSRM's public demo
server — the routing counterpart to geocode.ts's Nominatim call, same
fail-closed contract: any problem (network error, no route found) returns
null so the caller falls back to the straight-line estimate instead of
breaking the page. Same in-memory per-session cache too, keyed on the
rounded coordinate pair — repeat views of the same lane don't re-fetch.

router.project-osrm.org is explicitly a demo/showcase server for the OSRM
project, not meant for production traffic — no key, but no uptime or rate
guarantee either. See .claude/rules/security.md. */
export async function fetchDrivingRoute(
  origin: Coordinates,
  destination: Coordinates,
): Promise<DrivingRoute | null> {
  const key = `${origin.lat.toFixed(4)},${origin.lng.toFixed(4)}->${destination.lat.toFixed(4)},${destination.lng.toFixed(4)}`;
  if (cache.has(key)) return cache.get(key) ?? null;

  try {
    const url =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${origin.lng},${origin.lat};${destination.lng},${destination.lat}` +
      `?overview=full&geometries=geojson`;
    const res = await fetch(url);
    if (!res.ok) {
      cache.set(key, null);
      return null;
    }

    const data = await res.json();
    const route = data?.routes?.[0];
    const coordinates = route?.geometry?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length === 0) {
      cache.set(key, null);
      return null;
    }

    const path: [number, number][] = coordinates.map(([lng, lat]: [number, number]) => [
      lat,
      lng,
    ]);

    const result: DrivingRoute = {
      path,
      distanceMiles: route.distance / 1609.34,
      durationMinutes: route.duration / 60,
    };
    cache.set(key, result);
    return result;
  } catch {
    cache.set(key, null);
    return null;
  }
}
