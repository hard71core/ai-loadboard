from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ... import models, schemas
from ...core.llm import parse_search_query
from ..deps import get_db

router = APIRouter(prefix="/api/search", tags=["search"])


@router.post("", response_model=list[schemas.LoadOut])
def search_loads(payload: schemas.SearchQuery, db: Session = Depends(get_db)):
    """Free-text load search. Parses the query into a SearchFilter via the
    LLM Gateway (core/llm.py) and applies whichever fields came back
    non-null. If parsing is unavailable for any reason, this silently
    degrades to the same result as GET /api/loads with no filter — a
    deterministic fallback, not an error, per the AI-subsystem principle in
    docs/technical-documentation.html section 7."""
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

    return query.order_by(models.Load.created_at.desc()).all()
