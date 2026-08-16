"""Unit tests for core/eta.py's actual heuristic — _geocode, _route, and
estimate_transit. test_eta.py (api/routes/eta.py) mocks estimate_transit
wholesale to test the route's response shape; this file mocks one layer
lower, at httpx.get, so the geocoding/routing/caching/fail-closed logic
inside core/eta.py itself actually runs and gets exercised. No DB needed —
core/eta.py doesn't touch the database at all.

_geocode_cache/_route_cache are module-level dicts (core/eta.py's in-memory
cache, deliberately process-lifetime, see its docstring) — an autouse
fixture clears both before every test here so one test's cached result
can't silently skip another test's httpx.get mock.
"""

from unittest.mock import Mock, patch

import httpx
import pytest

from app.core import eta


@pytest.fixture(autouse=True)
def _clear_eta_caches():
    eta._geocode_cache.clear()
    eta._route_cache.clear()
    yield
    eta._geocode_cache.clear()
    eta._route_cache.clear()


def _ok_response(payload) -> Mock:
    response = Mock()
    response.raise_for_status = Mock()
    response.json = Mock(return_value=payload)
    return response


class TestGeocode:
    def test_returns_coordinates_on_success(self):
        with patch(
            "app.core.eta.httpx.get",
            return_value=_ok_response([{"lat": "32.7767", "lon": "-96.7970"}]),
        ) as mock_get:
            coords = eta._geocode("Dallas, TX")
        assert coords == (32.7767, -96.7970)
        assert mock_get.call_count == 1

    def test_caches_across_calls(self):
        with patch(
            "app.core.eta.httpx.get",
            return_value=_ok_response([{"lat": "32.7767", "lon": "-96.7970"}]),
        ) as mock_get:
            eta._geocode("Dallas, TX")
            eta._geocode("Dallas, TX")
            eta._geocode("dallas, tx  ")  # same key once normalized
        assert mock_get.call_count == 1

    def test_returns_none_for_blank_location_without_calling_out(self):
        with patch("app.core.eta.httpx.get") as mock_get:
            assert eta._geocode("   ") is None
        mock_get.assert_not_called()

    def test_returns_none_when_nominatim_finds_nothing(self):
        with patch("app.core.eta.httpx.get", return_value=_ok_response([])):
            assert eta._geocode("Nowhere, ZZ") is None

    def test_returns_none_on_network_error(self):
        with patch("app.core.eta.httpx.get", side_effect=httpx.ConnectError("boom")):
            assert eta._geocode("Dallas, TX") is None

    def test_returns_none_on_http_error_status(self):
        response = Mock()
        response.raise_for_status = Mock(
            side_effect=httpx.HTTPStatusError("503", request=Mock(), response=Mock())
        )
        with patch("app.core.eta.httpx.get", return_value=response):
            assert eta._geocode("Dallas, TX") is None


class TestRoute:
    _ORIGIN = (32.7767, -96.7970)
    _DEST = (29.7604, -95.3698)

    def test_returns_distance_and_duration_on_success(self):
        osrm_payload = {"routes": [{"distance": 385826.0, "duration": 15200.0}]}
        with patch("app.core.eta.httpx.get", return_value=_ok_response(osrm_payload)) as mock_get:
            result = eta._route(self._ORIGIN, self._DEST)
        assert result is not None
        distance_miles, duration_minutes = result
        assert distance_miles == pytest.approx(385826.0 / 1609.34)
        assert duration_minutes == pytest.approx(15200.0 / 60)
        assert mock_get.call_count == 1

    def test_caches_across_calls(self):
        osrm_payload = {"routes": [{"distance": 100000.0, "duration": 3600.0}]}
        with patch("app.core.eta.httpx.get", return_value=_ok_response(osrm_payload)) as mock_get:
            eta._route(self._ORIGIN, self._DEST)
            eta._route(self._ORIGIN, self._DEST)
        assert mock_get.call_count == 1

    def test_returns_none_when_osrm_has_no_route(self):
        with patch("app.core.eta.httpx.get", return_value=_ok_response({"routes": []})):
            assert eta._route(self._ORIGIN, self._DEST) is None

    def test_returns_none_on_network_error(self):
        with patch("app.core.eta.httpx.get", side_effect=httpx.ConnectError("boom")):
            assert eta._route(self._ORIGIN, self._DEST) is None


class TestEstimateTransit:
    def test_happy_path_applies_the_hos_band(self):
        with patch("app.core.eta._geocode", side_effect=[(32.0, -96.0), (29.0, -95.0)]):
            with patch("app.core.eta._route", return_value=(240.0, 253.0)):
                result = eta.estimate_transit("Dallas, TX", "Houston, TX")

        assert result is not None
        assert result.distance_miles == 240.0
        assert result.drive_hours_min == pytest.approx(253.0 / 60)
        assert result.drive_hours_max == pytest.approx(
            result.drive_hours_min * eta._HOS_BAND_MULTIPLIER
        )
        assert result.drive_hours_max > result.drive_hours_min

    def test_returns_none_when_origin_does_not_geocode(self):
        with patch("app.core.eta._geocode", side_effect=[None, (29.0, -95.0)]):
            with patch("app.core.eta._route") as mock_route:
                result = eta.estimate_transit("Nowhere, ZZ", "Houston, TX")
        assert result is None
        mock_route.assert_not_called()

    def test_returns_none_when_destination_does_not_geocode(self):
        with patch("app.core.eta._geocode", side_effect=[(32.0, -96.0), None]):
            with patch("app.core.eta._route") as mock_route:
                result = eta.estimate_transit("Dallas, TX", "Nowhere, ZZ")
        assert result is None
        mock_route.assert_not_called()

    def test_returns_none_when_routing_fails(self):
        with patch("app.core.eta._geocode", side_effect=[(32.0, -96.0), (29.0, -95.0)]):
            with patch("app.core.eta._route", return_value=None):
                result = eta.estimate_transit("Dallas, TX", "Houston, TX")
        assert result is None
