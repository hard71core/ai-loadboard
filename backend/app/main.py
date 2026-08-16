import os
import time
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from . import models, schemas
from .auth import create_access_token, get_current_user, hash_password, verify_password
from .database import Base, engine, get_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db_with_retry()
    db = next(get_db())
    try:
        if db.query(models.Load).count() == 0:
            for item in SEED_LOADS:
                db.add(models.Load(**item))
            db.commit()
    finally:
        db.close()
    yield


app = FastAPI(title="AI Loadboard API — Demo", lifespan=lifespan)

# Comma-separated list of allowed origins, e.g. "http://localhost:5173,https://app.example.com".
# Falls back to the Vite dev server origin so `docker compose up` keeps working
# out of the box even if CORS_ORIGINS isn't set.
_cors_origins = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

# Demo seed data: a handful of loads posted directly by shippers, waiting to be
# matched with a carrier — no broker in between.
SEED_LOADS = [
    dict(
        title="Охолоджені продукти",
        origin="Dallas, TX",
        destination="Houston, TX",
        equipment_type="Reefer",
        weight_lbs=38000,
        price_usd=850,
        shipper_name="Northgate Foods",
    ),
    dict(
        title="Будматеріали",
        origin="Chicago, IL",
        destination="Indianapolis, IN",
        equipment_type="Flatbed",
        weight_lbs=42000,
        price_usd=620,
        shipper_name="Midwest Builders Supply",
    ),
    dict(
        title="Побутова техніка",
        origin="Atlanta, GA",
        destination="Charlotte, NC",
        equipment_type="Dry Van",
        weight_lbs=25000,
        price_usd=540,
        shipper_name="Home Comfort Retail",
    ),
    dict(
        title="Автозапчастини",
        origin="Detroit, MI",
        destination="Cleveland, OH",
        equipment_type="Dry Van",
        weight_lbs=18000,
        price_usd=410,
        shipper_name="AutoParts Direct",
    ),
]


def init_db_with_retry(retries: int = 15, delay: float = 2.0) -> None:
    """The db container may still be starting up when this service boots —
    retry table creation instead of crashing immediately."""
    for attempt in range(1, retries + 1):
        try:
            Base.metadata.create_all(bind=engine)
            return
        except OperationalError:
            if attempt == retries:
                raise
            time.sleep(delay)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register", response_model=schemas.Token, status_code=201)
def register(payload: schemas.UserCreate, db: Session = Depends(get_db)):
    existing = db.query(models.User).filter(models.User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Користувач з таким email вже існує")
    user = models.User(
        email=payload.email,
        hashed_password=hash_password(payload.password),
        company_name=payload.company_name,
        role=payload.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return schemas.Token(access_token=create_access_token(user.email), user=user)


@app.post("/api/auth/login", response_model=schemas.Token)
def login(payload: schemas.LoginPayload, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Невірний email або пароль")
    return schemas.Token(access_token=create_access_token(user.email), user=user)


@app.get("/api/auth/me", response_model=schemas.UserOut)
def me(current_user: models.User = Depends(get_current_user)):
    return current_user


@app.get("/api/loads", response_model=list[schemas.LoadOut])
def list_loads(status: str | None = None, db: Session = Depends(get_db)):
    query = db.query(models.Load)
    if status:
        query = query.filter(models.Load.status == status)
    return query.order_by(models.Load.created_at.desc()).all()


@app.post("/api/loads", response_model=schemas.LoadOut)
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


@app.post("/api/loads/{load_id}/accept", response_model=schemas.LoadOut)
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


@app.post("/api/loads/{load_id}/complete", response_model=schemas.LoadOut)
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
