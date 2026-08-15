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
    shipper_name: str


class LoadCreate(LoadBase):
    pass


class AcceptPayload(BaseModel):
    carrier_name: str


class LoadOut(LoadBase):
    id: int
    status: LoadStatus
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
