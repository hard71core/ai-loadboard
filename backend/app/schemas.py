from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from .models import LoadStatus, UserRole


class LoadBase(BaseModel):
    title: str
    origin: str
    destination: str
    equipment_type: str = "Dry Van"
    weight_lbs: int
    price_usd: float


class LoadCreate(LoadBase):
    """Intentionally has no shipper_name field — the shipper is whoever the
    bearer token belongs to, not something the client gets to state."""


class LoadOut(LoadBase):
    id: int
    status: LoadStatus
    shipper_name: str
    carrier_name: str | None = None
    created_at: datetime
    accepted_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    company_name: str
    role: UserRole


class UserOut(BaseModel):
    id: int
    email: EmailStr
    company_name: str
    role: UserRole

    model_config = ConfigDict(from_attributes=True)


class LoginPayload(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserOut


class RefreshPayload(BaseModel):
    refresh_token: str


class SearchQuery(BaseModel):
    query: str = Field(min_length=1, max_length=500)


class SearchFilter(BaseModel):
    """Structured filter extracted from a free-text NL search query by
    core/llm.py. Every field is optional — set only when the query actually
    specified it; the caller applies whichever fields came back non-null."""

    origin: str | None = None
    destination: str | None = None
    equipment_type: str | None = None
    price_max: float | None = None
    weight_min: int | None = None
    weight_max: int | None = None


class LoadETA(BaseModel):
    """Response for GET /api/loads/{id}/eta — see core/eta.py for how the
    numbers are derived and why there's no real confidence interval yet.
    distance_miles/drive_hours_* are None when live routing data couldn't be
    fetched at all; eta_earliest/eta_latest are additionally None whenever
    the load hasn't been accepted yet (no accepted_at to measure from)."""

    load_id: int
    status: LoadStatus
    model_version: str = "eta-heuristic-v1"
    basis: str
    distance_miles: float | None = None
    drive_hours_min: float | None = None
    drive_hours_max: float | None = None
    eta_earliest: datetime | None = None
    eta_latest: datetime | None = None
