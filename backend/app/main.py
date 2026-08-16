import time
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import OperationalError

from . import models
from .api.routes import auth, loads, matching, search
from .core.config import get_cors_origins
from .core.database import Base, engine, get_db


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

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_origins(),
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

app.include_router(auth.router)
app.include_router(loads.router)
app.include_router(matching.router)
app.include_router(search.router)

# Demo seed data: a handful of loads posted directly by shippers, waiting to be
# matched with a carrier — no broker in between.
SEED_LOADS = [
    dict(
        title="Refrigerated produce",
        origin="Dallas, TX",
        destination="Houston, TX",
        equipment_type="Reefer",
        weight_lbs=38000,
        price_usd=850,
        shipper_name="Northgate Foods",
    ),
    dict(
        title="Building materials",
        origin="Chicago, IL",
        destination="Indianapolis, IN",
        equipment_type="Flatbed",
        weight_lbs=42000,
        price_usd=620,
        shipper_name="Midwest Builders Supply",
    ),
    dict(
        title="Home appliances",
        origin="Atlanta, GA",
        destination="Charlotte, NC",
        equipment_type="Dry Van",
        weight_lbs=25000,
        price_usd=540,
        shipper_name="Home Comfort Retail",
    ),
    dict(
        title="Auto parts",
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
