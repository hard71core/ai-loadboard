from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ... import models, schemas
from ...core.security import create_access_token, hash_password, verify_password
from ..deps import get_current_user, get_db

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=schemas.Token, status_code=201)
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


@router.post("/login", response_model=schemas.Token)
def login(payload: schemas.LoginPayload, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Невірний email або пароль")
    return schemas.Token(access_token=create_access_token(user.email), user=user)


@router.get("/me", response_model=schemas.UserOut)
def me(current_user: models.User = Depends(get_current_user)):
    return current_user
