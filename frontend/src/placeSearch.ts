/** Live place search (city/town/village/hamlet — anything with a name, not
just the largest metros) for the post-a-load form's city picker, scoped to
whichever state the user already chose.

Deliberately Photon (Komoot's keyless public geocoder, photon.komoot.io),
not Nominatim like geocode.ts/routing.ts use elsewhere in this app — tried
Nominatim first and it doesn't do true prefix/typeahead matching: querying
"Chicag" (still typing "Chicago") returns nothing, because Nominatim's
search expects complete or near-complete words, not partial ones. Photon is
built on the same OSM data but specifically indexed for autocomplete
(edge-ngram search), so "Chicag" correctly finds Chicago, IL as the top
result. Same fail-closed contract as geocode.ts/routing.ts: any problem
(network error, no results) resolves to an empty array, never throws.
Same public-demo-server caveat too (no uptime/rate guarantee) — see
.claude/rules/security.md.

Callers are expected to debounce (see Combobox.tsx) — this function itself
doesn't, it's a plain single request per call, cached by query+state so
retyping the same thing doesn't re-hit the network. */

export interface PlaceResult {
  /** Display name for the option and what actually gets stored, e.g.
  "Springfield" — Photon's own `name` field, not a display string with
  county/country baked in. */
  city: string;
  /** Two-letter USPS code. Photon returns the full state name
  (properties.state, e.g. "Illinois"); LoadsPage.tsx passes in the state
  name text for query bias, but the code itself comes from cross-checking
  properties.state against the already-selected state's entry in
  usLocations.ts — see searchPlaces's stateCode parameter. */
  stateCode: string;
}

interface PhotonFeature {
  properties?: {
    name?: string;
    state?: string;
    countrycode?: string;
  };
}

const _cache = new Map<string, PlaceResult[]>();

export async function searchPlaces(
  query: string,
  stateName: string,
  stateCode: string,
): Promise<PlaceResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const cacheKey = `${trimmed.toLowerCase()}|${stateCode}`;
  if (_cache.has(cacheKey)) return _cache.get(cacheKey) ?? [];

  try {
    const url =
      `https://photon.komoot.io/api/?limit=8&lang=en&osm_tag=place` +
      `&q=${encodeURIComponent(`${trimmed}, ${stateName}`)}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      _cache.set(cacheKey, []);
      return [];
    }

    const data = (await res.json()) as { features?: PhotonFeature[] };
    const seen = new Set<string>();
    const results: PlaceResult[] = [];
    for (const feature of data.features ?? []) {
      const props = feature.properties;
      // Cross-checked against the state the user already picked, not just
      // "the query text happened to mention it" — Photon is a worldwide
      // index, a short query can and does return same-named places in
      // other US states or other countries entirely (querying "Dal" turns
      // up Dalian, China, for example).
      if (!props?.name || props.countrycode !== "US" || props.state !== stateName) continue;
      const key = props.name;
      if (seen.has(key)) continue; // Photon can list the same place at more than one admin level
      seen.add(key);
      results.push({ city: props.name, stateCode });
    }

    _cache.set(cacheKey, results);
    return results;
  } catch {
    _cache.set(cacheKey, []);
    return [];
  }
}
