import enum

from sqlalchemy import Column, DateTime, Integer, Numeric, String
from sqlalchemy import Enum as SAEnum
from sqlalchemy.sql import func

from .database import Base


class LoadStatus(str, enum.Enum):
    open = "open"
    accepted = "accepted"
    completed = "completed"


class UserRole(str, enum.Enum):
    shipper = "shipper"
    carrier = "carrier"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, nullable=False, index=True)
    hashed_password = Column(String, nullable=False)
    company_name = Column(String, nullable=False)
    role = Column(SAEnum(UserRole), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Load(Base):
    """A shipment posted directly by a shipper, matched directly to a carrier —
    no broker in the middle."""

    __tablename__ = "loads"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    origin = Column(String, nullable=False)
    destination = Column(String, nullable=False)
    equipment_type = Column(String, nullable=False, default="Dry Van")
    weight_lbs = Column(Integer, nullable=False, default=0)
    price_usd = Column(Numeric(10, 2), nullable=False)
    shipper_name = Column(String, nullable=False)
    carrier_name = Column(String, nullable=True)
    status = Column(SAEnum(LoadStatus), nullable=False, default=LoadStatus.open)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
