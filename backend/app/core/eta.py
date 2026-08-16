"""Arrival-time estimate for the ETA feature (api/routes/eta.py).

Target design (docs/technical-documentation.html section 7.7) is a
regression model on top of carrier GPS telematics, live traffic, weather,
and remaining HOS drive-time. None of those feeds exist yet — no telematics
integration, no carrier GPS, no traffic/weather API. Same principle as
Matching (core/matching heuristic in api/routes/matching.py) and NL Search
(core/llm.py): ship a deterministic version that's actually useful today,
upgrade to the real model once there's data/infrastructure worth building
it on.

The heuristic: geocode origin/destination via Nominatim, get the real
driving distance and duration via OSRM (same providers as the frontend's
geocode.ts/routing.ts, called server-side here instead — this is the only
backend module that calls either), then widen OSRM's plain car-profile
duration into a [min, max] band to stand in for the truck-specific factors
we can't model yet (mandatory rest breaks under HOS, lower average truck
speed) — the `_HOS_BAND_MULTIPLIER` docstring below spells out the exact
approximation. Every call fails closed: any problem (network error,
location not found, non-2xx response) returns None, and the caller
(api/routes/eta.py) degrades to "estimate unavailable" rather than raising
— same contract as core/llm.py and the frontend's geocode.ts/routing.ts.
"""

import logging
from dataclasses import dataclass

import httpx

logger = logging.getLogger(__name__)

# Nominatim's usage policy expects identifiable traffic and asks for a
# descriptive User-Agent on server-side callers in particular (unlike a
# browser tab, a backend process sends no Referer at all otherwise).
_USER_AGENT = "ai-loadboard-demo/1.0 (+https://github.com/hard71core/ai-loadboard)"
_TIMEOUT_SECONDS = 5.0

# OSRM's default driving profile estimates a car's travel time — no
# mandatory rest breaks, no lower average cruising speed for a loaded
# truck. Rather than fabricate a fake regression, the band below is an
# explicit, documented approximation: the low end is OSRM's raw duration
# (best case, no stops); the high end multiplies it by this factor to
# stand in for typical long-haul rest stops under FMCSA hours-of-service
# rules. It is a rough correction, not a real HOS simulation — the same
# "accuracy degrades transparently, not silently" principle the target
# design (7.7) calls for, just applied to a wider band instead of a real
# confidence interval computed from telematics data.
_HOS_BAND_MULTIPLIER = 1.3

_geocode_cache: dict[str, tuple[float, float] | None] = {}
_route_cache: dict[str, tuple[float, float] | None] = {}


@dataclass
class TransitEstimate:
    distance_miles: float
    drive_hours_min: float
    drive_hours_max: float


def _geocode(location: str) -> tuple[float, float] | None:
    key = location.strip().lower()
    if not key:
        return None
    if key in _geocode_cache:
        return _geocode_cache[key]

    try:
        res = httpx.get(
            "https://nominatim.openstreetmap.org/search",
            params={"format": "json", "limit": 1, "q": location},
            headers={"User-Agent": _USER_AGENT, "Accept": "application/json"},
            timeout=_TIMEOUT_SECONDS,
        )
        res.raise_for_status()
        results = res.json()
        if not results:
            _geocode_cache[key] = None
            return None
        coords = (float(results[0]["lat"]), float(results[0]["lon"]))
    except Exception:
        logger.exception("ETA: geocoding failed for %r", location)
        _geocode_cache[key] = None
        return None

    _geocode_cache[key] = coords
    return coords


def _route(
    origin: tuple[float, float], destination: tuple[float, float]
) -> tuple[float, float] | None:
    """Returns (distance_miles, duration_minutes) via OSRM's public demo
    server, or None on any failure — see .claude/rules/security.md, this
    server has no uptime or rate guarantee."""
    key = f"{origin[0]:.4f},{origin[1]:.4f}->{destination[0]:.4f},{destination[1]:.4f}"
    if key in _route_cache:
        return _route_cache[key]

    try:
        url = (
            "https://router.project-osrm.org/route/v1/driving/"
            f"{origin[1]},{origin[0]};{destination[1]},{destination[0]}"
        )
        res = httpx.get(url, params={"overview": "false"}, timeout=_TIMEOUT_SECONDS)
        res.raise_for_status()
        data = res.json()
        route = (data.get("routes") or [None])[0]
        if not route:
            _route_cache[key] = None
            return None
        result = (route["distance"] / 1609.34, route["duration"] / 60)
    except Exception:
        logger.exception("ETA: OSRM routing failed for %s -> %s", origin, destination)
        _route_cache[key] = None
        return None

    _route_cache[key] = result
    return result


def estimate_transit(origin: str, destination: str) -> TransitEstimate | None:
    """Geocodes both ends and fetches the real driving distance/duration,
    returning a [min, max] drive-time band. None on any failure along the
    way — callers must treat that as "estimate unavailable", not an error."""
    origin_coords = _geocode(origin)
    dest_coords = _geocode(destination)
    if not origin_coords or not dest_coords:
        return None

    routed = _route(origin_coords, dest_coords)
    if not routed:
        return None

    distance_miles, duration_minutes = routed
    drive_hours_min = duration_minutes / 60
    return TransitEstimate(
        distance_miles=distance_miles,
        drive_hours_min=drive_hours_min,
        drive_hours_max=drive_hours_min * _HOS_BAND_MULTIPLIER,
    )
