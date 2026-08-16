from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ... import models, schemas
from ..deps import get_current_user, get_db

router = APIRouter(prefix="/api/loads", tags=["loads"])


@router.get("", response_model=list[schemas.LoadOut])
def list_loads(status: str | None = None, db: Session = Depends(get_db)):
    query = db.query(models.Load)
    if status:
        query = query.filter(models.Load.status == status)
    return query.order_by(models.Load.created_at.desc()).all()


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
