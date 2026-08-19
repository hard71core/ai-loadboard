import math
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ... import models, schemas
from ..deps import get_current_user, get_db

router = APIRouter(prefix="/api/loads", tags=["loads"])


@router.get("", response_model=schemas.PaginatedLoads)
def list_loads(
    status: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Page/page_size offset pagination — the MVP; docs/technical-
    documentation.html section 8 still lists cursor pagination (`?cursor=`)
    as the Phase 2 target for when the dataset is large enough that offset
    pagination's performance characteristics (re-counting/re-scanning on
    every page) start to matter. `matching.py`'s `/matches` and
    `search.py`'s NL search stay full-array responses, unchanged — they
    query the DB directly, not through this route, so this change doesn't
    touch them; paginating their result sets is explicitly out of scope
    here."""
    query = db.query(models.Load)
    if status:
        query = query.filter(models.Load.status == status)
    total = query.count()
    items = (
        query.order_by(models.Load.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return schemas.PaginatedLoads(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=max(1, math.ceil(total / page_size)),
    )


@router.get("/mine", response_model=list[schemas.LoadOut])
def list_my_loads(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Backs the personal-cabinet page — every load the caller shows up on,
    either side: posted as shipper or accepted as carrier, any status. No
    role gate (unlike matching.py's /matches, carrier-only) — a shipper's
    "mine" is what they posted, a carrier's is what they've accepted, both
    are valid, non-empty queries. "mine" isn't digits, so it never collides
    with GET /{load_id:int} below regardless of route registration order —
    see that route's docstring for the collision this same shape of literal
    path had to avoid with matching.py's /matches before it got the :int
    converter."""
    return (
        db.query(models.Load)
        .filter(
            or_(
                models.Load.shipper_id == current_user.id,
                models.Load.carrier_id == current_user.id,
            )
        )
        .order_by(models.Load.created_at.desc())
        .all()
    )


@router.get("/{load_id:int}", response_model=schemas.LoadOut)
def get_load(load_id: int, db: Session = Depends(get_db)):
    """Single-load detail page. The `:int` path converter is deliberate,
    not just typing hygiene — a plain `{load_id}` matches *any* string at
    Starlette's routing layer (including "matches"), which would 422 on
    GET /api/loads/matches instead of falling through to
    api/routes/matching.py's route for it. `:int` makes the routing regex
    itself digits-only, so "matches" never matches this pattern and
    Starlette tries the next registered route instead."""
    load = db.query(models.Load).filter(models.Load.id == load_id).first()
    if not load:
        raise HTTPException(status_code=404, detail="Load not found")
    return load


@router.post("", response_model=schemas.LoadOut)
def create_load(
    payload: schemas.LoadCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.role != models.UserRole.shipper:
        raise HTTPException(status_code=403, detail="Only shippers can post loads")
    load = models.Load(
        **payload.model_dump(),
        shipper_id=current_user.id,
        shipper_name=current_user.company_name,
    )
    db.add(load)
    db.commit()
    db.refresh(load)
    return load


@router.post("/{load_id}/accept", response_model=schemas.LoadOut)
def accept_load(
    load_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.role != models.UserRole.carrier:
        raise HTTPException(status_code=403, detail="Only carriers can accept loads")
    load = db.query(models.Load).filter(models.Load.id == load_id).first()
    if not load:
        raise HTTPException(status_code=404, detail="Load not found")
    if load.status != models.LoadStatus.open:
        raise HTTPException(status_code=400, detail="Load already taken")
    load.carrier_id = current_user.id
    load.carrier_name = current_user.company_name
    load.status = models.LoadStatus.accepted
    load.accepted_at = datetime.now(UTC)
    db.commit()
    db.refresh(load)
    return load


@router.post("/{load_id}/complete", response_model=schemas.LoadOut)
def complete_load(
    load_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    load = db.query(models.Load).filter(models.Load.id == load_id).first()
    if not load:
        raise HTTPException(status_code=404, detail="Load not found")
    if current_user.id not in (load.shipper_id, load.carrier_id):
        raise HTTPException(status_code=403, detail="Not authorized to complete this load")
    if load.status != models.LoadStatus.accepted:
        # Without this, an open load (carrier_id still None) could jump
        # straight to completed — the shipper is always in
        # (shipper_id, carrier_id) for their own load, accepted or not, so
        # the ownership check above alone doesn't rule that out.
        raise HTTPException(status_code=400, detail="Only an accepted load can be completed")
    load.status = models.LoadStatus.completed
    db.commit()
    db.refresh(load)
    return load
