"""
Authentication Service for Fleet Management System
Handles user authentication, JWT tokens, and role-based access
"""
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

logger = logging.getLogger(__name__)

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT Configuration — must be set via environment in production
_INSECURE_PLACEHOLDER = "fleet-management-secret-key-2024"
SECRET_KEY = os.environ.get("JWT_SECRET_KEY", _INSECURE_PLACEHOLDER)
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24

security = HTTPBearer()


def assert_jwt_configuration() -> None:
    """Fail startup if JWT secret is missing or too weak for the active environment."""
    env = os.environ.get("ENVIRONMENT", "development").lower()
    if not SECRET_KEY:
        raise RuntimeError("JWT_SECRET_KEY environment variable is required")
    if SECRET_KEY == _INSECURE_PLACEHOLDER and env == "production":
        raise RuntimeError(
            "JWT_SECRET_KEY cannot use the default placeholder in production. "
            "Set a strong random secret (e.g. openssl rand -hex 32)."
        )
    if SECRET_KEY == _INSECURE_PLACEHOLDER:
        logger.warning(
            "JWT_SECRET_KEY is using the development placeholder — set a strong secret before production."
        )
        return
    if len(SECRET_KEY) < 32:
        if env == "production":
            raise RuntimeError(
                "JWT_SECRET_KEY must be at least 32 characters in production "
                "(e.g. openssl rand -hex 32)."
            )
        logger.warning("JWT_SECRET_KEY should be at least 32 characters for adequate entropy")


def decode_token_raw(token: str) -> dict:
    """Decode JWT or raise jose.JWTError (for middleware)."""
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain password against a hashed password"""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Hash a password"""
    return pwd_context.hash(password)


def validate_password_strength(password: str) -> None:
    """
    Enforce baseline complexity for new passwords (registration, bootstrap, reset).
    Raises ValueError with a clear message if validation fails.
    """
    if len(password) < 8:
        raise ValueError("Password must be at least 8 characters")
    if not any(c.islower() for c in password):
        raise ValueError("Password must contain at least one lowercase letter")
    if not any(c.isupper() for c in password):
        raise ValueError("Password must contain at least one uppercase letter")
    if not any(c.isdigit() for c in password):
        raise ValueError("Password must contain at least one digit")
    special = '!@#$%^&*()_+-=[]{}|;:,.<>?'
    if not any(c in special for c in password):
        raise ValueError(
            f"Password must contain at least one special character ({special})"
        )


def access_token_payload_from_user_record(user: dict) -> dict:
    """Build JWT claims including token version for session invalidation."""
    role = user.get("role")
    if hasattr(role, "value"):
        role = role.value
    return {
        "sub": user["id"],
        "email": user["email"],
        "role": role,
        "country": user.get("country"),
        "full_name": user["full_name"],
        "tv": int(user.get("token_version", 0)),
    }


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT access token"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def decode_token(token: str) -> dict:
    """Decode and validate a JWT token"""
    try:
        return decode_token_raw(token)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """Get the current user from the JWT token (HTTPBearer — for tests / non-middleware paths)."""
    token = credentials.credentials
    payload = decode_token(token)

    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
        )

    return {
        "id": user_id,
        "email": payload.get("email"),
        "role": payload.get("role"),
        "country": payload.get("country"),
        "full_name": payload.get("full_name"),
    }


def require_role(allowed_roles: list):
    """Dependency to require specific roles (JWT only — prefer auth_deps for DB validation)."""

    async def role_checker(current_user: dict = Depends(get_current_user)):
        if current_user["role"] not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return current_user

    return role_checker


def require_group_manager():
    """Require Group Fleet Manager role"""
    return require_role(["GROUP_FLEET_MANAGER"])


def require_manager():
    """Require any manager role (Group Fleet Manager or Fleet Manager)"""
    return require_role(["GROUP_FLEET_MANAGER", "FLEET_MANAGER"])


def require_fleet_staff():
    """Require fleet staff role (managers + officers)"""
    return require_role(["GROUP_FLEET_MANAGER", "FLEET_MANAGER", "FLEET_OFFICER"])


def require_any_authenticated():
    """Require any authenticated user"""
    return require_role(["GROUP_FLEET_MANAGER", "FLEET_MANAGER", "FLEET_OFFICER", "DRIVER", "USER"])
