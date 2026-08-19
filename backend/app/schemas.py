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


class PaginatedLoads(BaseModel):
    """Envelope for GET /api/loads — its MVP pagination is page/page_size
    offset pagination, not the cursor-based pagination (`?cursor=`)
    docs/technical-documentation.html section 8 lists as the Phase 2
    target; see that section for the reconciliation note. `total`/
    `total_pages` reflect whatever `status` filter was applied, same as
    `items`. A `page` beyond the last available one returns an empty
    `items` list (still HTTP 200, not a 404) — there's nothing wrong with
    the request, the result set for that page is just empty."""

    items: list[LoadOut]
    total: int
    page: int
    page_size: int
    total_pages: int


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    company_name: str
    role: UserRole


class UserUpdate(BaseModel):
    """PATCH /api/auth/me — company_name is the only field a user can
    self-edit for now (no email/password change endpoint yet). Email and
    role stay fixed post-registration: email is the login identifier and
    role drives authorization checks throughout loads.py/matching.py, so
    letting either change here would need its own dedicated review, not a
    drive-by addition to this schema."""

    company_name: str = Field(min_length=1)


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
