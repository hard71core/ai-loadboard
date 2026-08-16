import hashlib
import os
import secrets
from datetime import UTC, datetime, timedelta

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from .. import models
from .database import get_db  # also loads the project-root .env as a side effect

# In a real deployment this must come from a secret manager / env var set at
# deploy time — the fallback here only exists so the demo runs out of the box.
SECRET_KEY = os.getenv("JWT_SECRET", "dev-secret-change-me")
ALGORITHM = "HS256"
# Short-lived on purpose — the access token itself can never be revoked
# (that's what a refresh token + refresh_tokens table are for, below), so
# keeping this small bounds how long a stolen access token stays useful.
# 15 min by default; the frontend refreshes silently before it expires
# (AuthContext.tsx) so this isn't user-visible under normal use.
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", 15))
# The refresh token is what actually keeps a session alive across days —
# opaque and revocable (unlike the JWT above), see RefreshToken in models.py.
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", 30))

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(subject: str) -> str:
    expire = datetime.now(UTC) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": subject, "exp": expire}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def _hash_token(raw_token: str) -> str:
    """Refresh tokens are long random opaque strings, not JWTs — nothing to
    verify a signature against, so a plain SHA-256 digest (not bcrypt: this
    is a lookup key over a high-entropy value, not a low-entropy password
    that needs slow hashing against guessing) is enough to avoid storing the
    usable credential itself in the DB."""
    return hashlib.sha256(raw_token.encode()).hexdigest()


def issue_refresh_token(db: Session, user_id: int) -> str:
    raw_token = secrets.token_urlsafe(48)
    db.add(
        models.RefreshToken(
            user_id=user_id,
            token_hash=_hash_token(raw_token),
            expires_at=datetime.now(UTC) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
        )
    )
    db.commit()
    return raw_token


def rotate_refresh_token(db: Session, raw_token: str) -> tuple[str, models.User] | None:
    """Validates raw_token, revokes it, and issues a replacement — rotation,
    not reuse, so a leaked-and-later-replayed token is a rejected second use
    rather than a silently-still-valid one. Returns (new_raw_token, user) on
    success, None if the token is missing, expired, or already revoked (that
    last case is exactly the replay signal this scheme exists to catch)."""
    row = (
        db.query(models.RefreshToken)
        .filter(models.RefreshToken.token_hash == _hash_token(raw_token))
        .first()
    )
    if not row or row.revoked_at is not None or row.expires_at < datetime.now(UTC):
        return None

    user = db.query(models.User).filter(models.User.id == row.user_id).first()
    if not user:
        return None

    row.revoked_at = datetime.now(UTC)
    new_raw_token = issue_refresh_token(db, user.id)
    db.commit()
    return new_raw_token, user


def revoke_refresh_token(db: Session, raw_token: str) -> None:
    """Best-effort logout — an unknown/already-revoked/expired token is not
    an error here, there's nothing left to revoke either way."""
    row = (
        db.query(models.RefreshToken)
        .filter(models.RefreshToken.token_hash == _hash_token(raw_token))
        .first()
    )
    if row and row.revoked_at is None:
        row.revoked_at = datetime.now(UTC)
        db.commit()


def get_current_user(
    token: str | None = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> models.User:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise credentials_error
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str | None = payload.get("sub")
        if email is None:
            raise credentials_error
    except JWTError as err:
        raise credentials_error from err

    user = db.query(models.User).filter(models.User.email == email).first()
    if user is None:
        raise credentials_error
    return user
