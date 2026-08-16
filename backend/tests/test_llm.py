"""core/llm.py's NL_SEARCH_ENABLED gate and its fail-closed contract. The
Anthropic SDK itself is mocked here too — these assert whether the client
gets constructed at all, not what it returns; see test_search.py for how a
SearchFilter (or None) drives the route's behavior. No DB needed — these
call parse_search_query() directly rather than going through TestClient."""

from unittest.mock import MagicMock, patch

from app.core.llm import parse_search_query


def test_parse_search_query_returns_none_when_flag_is_off(monkeypatch):
    monkeypatch.delenv("NL_SEARCH_ENABLED", raising=False)  # unset -> defaults off
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-a-real-looking-key")
    with patch("app.core.llm.anthropic.Anthropic") as mock_client:
        result = parse_search_query("reefer out of Dallas")
    assert result is None
    mock_client.assert_not_called()  # the flag must gate before any API call, not just the key


def test_parse_search_query_returns_none_without_a_key_even_when_enabled(monkeypatch):
    monkeypatch.setenv("NL_SEARCH_ENABLED", "true")
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    with patch("app.core.llm.anthropic.Anthropic") as mock_client:
        result = parse_search_query("reefer out of Dallas")
    assert result is None
    mock_client.assert_not_called()


def test_parse_search_query_calls_anthropic_when_enabled_and_configured(monkeypatch):
    monkeypatch.setenv("NL_SEARCH_ENABLED", "true")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-a-real-looking-key")

    mock_response = MagicMock()
    mock_response.parsed_output = "sentinel-filter"
    mock_client_instance = MagicMock()
    mock_client_instance.messages.parse.return_value = mock_response

    with patch(
        "app.core.llm.anthropic.Anthropic", return_value=mock_client_instance
    ) as mock_client:
        result = parse_search_query("reefer out of Dallas")

    mock_client.assert_called_once_with(api_key="sk-ant-a-real-looking-key")
    assert result == "sentinel-filter"
