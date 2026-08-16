from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ... import models, schemas
from ...core.security import (
    create_access_token,
    hash_password,
    issue_refresh_token,
    revoke_refresh_token,
    rotate_refresh_token,
    verify_password,
)
from ..deps import get_current_user, get_db

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _issue_token_pair(db: Session, user: models.User) -> schemas.Token:
    return schemas.Token(
        access_token=create_access_token(user.email),
        refresh_token=issue_refresh_token(db, user.id),
        user=user,
    )


@router.post("/register", response_model=schemas.Token, status_code=201)
def register(payload: schemas.UserCreate, db: Session = Depends(get_db)):
    existing = db.query(models.User).filter(models.User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="A user with this email already exists")
    user = models.User(
        email=payload.email,
        hashed_password=hash_password(payload.password),
        company_name=payload.company_name,
        role=payload.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return _issue_token_pair(db, user)


@router.post("/login", response_model=schemas.Token)
def login(payload: schemas.LoginPayload, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return _issue_token_pair(db, user)


@router.post("/refresh", response_model=schemas.Token)
def refresh(payload: schemas.RefreshPayload, db: Session = Depends(get_db)):
    """Exchanges a still-valid refresh token for a new access/refresh pair —
    rotation, not reuse (core/security.py's rotate_refresh_token), so the
    old refresh token stops working the moment this succeeds. No Bearer
    header involved: possessing a valid, unrevoked refresh token is what
    proves the caller is allowed to do this, same trust model as the
    password itself at /login."""
    result = rotate_refresh_token(db, payload.refresh_token)
    if not result:
        raise HTTPException(status_code=401, detail="Refresh token is invalid or expired")
    new_raw_token, user = result
    return schemas.Token(
        access_token=create_access_token(user.email),
        refresh_token=new_raw_token,
        user=user,
    )


@router.post("/logout", status_code=204)
def logout(payload: schemas.RefreshPayload, db: Session = Depends(get_db)):
    """Revokes the refresh token so it can't be used again — the access
    token itself can't be revoked (it's a stateless JWT) but it's short-lived
    by design (core/security.py) and expires on its own shortly after."""
    revoke_refresh_token(db, payload.refresh_token)


@router.get("/me", response_model=schemas.UserOut)
def me(current_user: models.User = Depends(get_current_user)):
    return current_user
