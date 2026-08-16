"""Thin wrapper around the Anthropic SDK for the NL-search feature.

Deliberately the only place in the codebase that talks to an LLM provider —
see docs/technical-documentation.html section 7.8 ("LLM Gateway" as a single
call point) and section 7 ("a model is never a single point of failure").
Every call here fails closed: any problem (no key, network error, provider
outage, a response that doesn't parse) returns None, and the caller treats
that exactly like "the user didn't specify a filter" rather than an error.
"""

import logging
import os

import anthropic

from ..schemas import SearchFilter

logger = logging.getLogger(__name__)

# Structured extraction, not open-ended reasoning — Haiku is the right size
# for this and an order of magnitude cheaper than Opus for the same job.
MODEL = "claude-haiku-4-5"

_SYSTEM_PROMPT = (
    "Extract search filters for a freight load board from the user's "
    "free-text query. Only set a field if the query actually specifies it "
    "— leave everything else null; do not guess or default. "
    "equipment_type must be exactly 'Dry Van', 'Reefer', or 'Flatbed' when "
    "given, and null otherwise."
)


def parse_search_query(query: str) -> SearchFilter | None:
    """Turns free text like "reefer out of Dallas this week under 900" into
    a SearchFilter. Returns None if the key isn't configured, the API call
    fails, or the response doesn't validate — callers must fall back to an
    unfiltered list in every one of those cases, not raise."""
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key or api_key.startswith("replace-with-"):
        return None

    try:
        client = anthropic.Anthropic(api_key=api_key)
        response = client.messages.parse(
            model=MODEL,
            max_tokens=1024,
            system=_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": query}],
            output_format=SearchFilter,
        )
    except Exception:
        logger.exception("NL search: Anthropic call failed, falling back to unfiltered list")
        return None

    return response.parsed_output
