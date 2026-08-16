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


@router.post("", response_model=schemas.LoadOut)
def create_load(
    payload: schemas.LoadCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.role != models.UserRole.shipper:
        raise HTTPException(
            status_code=403, detail="Тільки вантажовідправники можуть публікувати вантажі"
        )
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
        raise HTTPException(status_code=403, detail="Тільки перевізники можуть брати вантажі")
    load = db.query(models.Load).filter(models.Load.id == load_id).first()
    if not load:
        raise HTTPException(status_code=404, detail="Load not found")
    if load.status != models.LoadStatus.open:
        raise HTTPException(status_code=400, detail="Load already taken")
    load.carrier_id = current_user.id
    load.carrier_name = current_user.company_name
    load.status = models.LoadStatus.accepted
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
        raise HTTPException(status_code=403, detail="Немає прав завершити цей вантаж")
    load.status = models.LoadStatus.completed
    db.commit()
    db.refresh(load)
    return load
