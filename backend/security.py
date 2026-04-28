"""
Authentication and role-based access control utilities.
"""

import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer


SECRET_KEY = os.getenv("TAASA_SECRET_KEY", "change-this-secret-key-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("TAASA_ACCESS_TOKEN_EXPIRE_MINUTES", "120"))
POLICE_USERNAME = os.getenv("TAASA_POLICE_USERNAME", "police")
POLICE_PASSWORD = os.getenv("TAASA_POLICE_PASSWORD", "admin123")

bearer_scheme = HTTPBearer(auto_error=False)


@dataclass
class UserContext:
    role: str
    rider_id: Optional[int] = None
    rider_name: Optional[str] = None


def create_access_token(*, role: str, rider_id: Optional[int] = None, rider_name: Optional[str] = None) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": role,
        "role": role,
        "rider_id": rider_id,
        "rider_name": rider_name,
        "exp": expires_at,
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def authenticate_police(username: str, password: str) -> bool:
    return username == POLICE_USERNAME and password == POLICE_PASSWORD


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> UserContext:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing authentication token")

    token = credentials.credentials
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token") from exc

    role = payload.get("role")
    if role not in {"RIDER", "POLICE"}:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token role")

    rider_id = payload.get("rider_id")
    rider_name = payload.get("rider_name")
    if rider_id is not None:
        rider_id = int(rider_id)

    return UserContext(role=role, rider_id=rider_id, rider_name=rider_name)


def require_role(*roles: str):
    def _role_checker(current_user: UserContext = Depends(get_current_user)) -> UserContext:
        if current_user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient role permissions")
        return current_user

    return _role_checker


def ensure_rider_access(current_user: UserContext, rider_id: int) -> None:
    if current_user.role == "POLICE":
        return
    if current_user.role != "RIDER" or current_user.rider_id != rider_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only access your own rider data")
