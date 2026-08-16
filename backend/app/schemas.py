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
    token_type: str = "bearer"
    user: UserOut


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
