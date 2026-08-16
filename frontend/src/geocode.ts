/** Free, keyless geocoding via OpenStreetMap's Nominatim — turns a
"City, ST" string into approximate coordinates. This is the only place
in the frontend that calls a third-party geocoding service; every
caller gets `null` on any failure (no key needed, network error,
zero results) and is expected to degrade gracefully rather than break
the page — same fail-closed contract as backend/app/core/llm.py for
the AI calls.

Nominatim's usage policy caps free/unauthenticated use at ~1 request/
second and asks for identifiable traffic; fine for this demo's
traffic, not something to point real production load at without
either self-hosting Nominatim or moving to a paid geocoder. See
.claude/rules/security.md for this tracked as a known limitation. */

export interface Coordinates {
  lat: number;
  lng: number;
}

const cache = new Map<string, Coordinates | null>();

export async function geocodeLocation(query: string): Promise<Coordinates | null> {
  const key = query.trim().toLowerCase();
  if (!key) return null;
  if (cache.has(key)) return cache.get(key) ?? null;

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(
      query,
    )}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      cache.set(key, null);
      return null;
    }
    const results = (await res.json()) as Array<{ lat: string; lon: string }>;
    if (results.length === 0) {
      cache.set(key, null);
      return null;
    }
    const coords: Coordinates = { lat: Number(results[0].lat), lng: Number(results[0].lon) };
    cache.set(key, coords);
    return coords;
  } catch {
    cache.set(key, null);
    return null;
  }
}

/** Great-circle distance in miles — used to caption the approximate
route, not to draw it (the route itself is a straight line between the
two geocoded points, which is visually indistinguishable from a great
circle at the domestic US distances this app deals with). */
export function haversineMiles(a: Coordinates, b: Coordinates): number {
  const R = 3958.8; // Earth radius, miles
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
