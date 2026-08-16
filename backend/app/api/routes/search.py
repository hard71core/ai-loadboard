from fastapi import APIRouter, Depends
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ... import models, schemas
from ...core.llm import parse_search_query
from ..deps import get_db

router = APIRouter(prefix="/api/search", tags=["search"])


def _keyword_filter(query, raw_query: str):
    """Plain substring match across title/origin/destination/equipment_type:
    each whitespace-separated term must match in at least one of those
    columns (terms are ANDed together, columns are ORed per term). No
    external calls, nothing to fail — this is the fallback search used
    whenever the LLM path isn't available, so it needs to actually filter
    rather than silently return everything (see core/llm.py's docstring for
    when that happens)."""
    for term in raw_query.split():
        pattern = f"%{term}%"
        query = query.filter(
            or_(
                models.Load.title.ilike(pattern),
                models.Load.origin.ilike(pattern),
                models.Load.destination.ilike(pattern),
                models.Load.equipment_type.ilike(pattern),
            )
        )
    return query


@router.post("", response_model=list[schemas.LoadOut])
def search_loads(payload: schemas.SearchQuery, db: Session = Depends(get_db)):
    """Free-text load search. Parses the query into a SearchFilter via the
    LLM Gateway (core/llm.py) and applies whichever fields came back
    non-null. If parsing is unavailable for any reason (no API key, the
    call failed, the account is out of credit), this degrades to a plain
    keyword match instead — still a deterministic fallback, not an error,
    per the AI-subsystem principle in docs/technical-documentation.html
    section 7, but one that still actually searches rather than handing
    back every load."""
    query = db.query(models.Load)

    search_filter = parse_search_query(payload.query)
    if search_filter is not None:
        if search_filter.origin:
            query = query.filter(models.Load.origin.ilike(f"%{search_filter.origin}%"))
        if search_filter.destination:
            query = query.filter(models.Load.destination.ilike(f"%{search_filter.destination}%"))
        if search_filter.equipment_type:
            query = query.filter(models.Load.equipment_type == search_filter.equipment_type)
        if search_filter.price_max is not None:
            query = query.filter(models.Load.price_usd <= search_filter.price_max)
        if search_filter.weight_min is not None:
            query = query.filter(models.Load.weight_lbs >= search_filter.weight_min)
        if search_filter.weight_max is not None:
            query = query.filter(models.Load.weight_lbs <= search_filter.weight_max)
    else:
        query = _keyword_filter(query, payload.query)

    return query.order_by(models.Load.created_at.desc()).all()
