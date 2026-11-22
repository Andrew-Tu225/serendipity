from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    auth0_sub: str
    email: str | None
    email_verified: bool | None
    display_name: str | None
    picture_url: str | None
    onboarding_completed_at: datetime | None
    created_at: datetime
    updated_at: datetime


class SessionResponse(BaseModel):
    auth0: dict[str, Any]
    user: UserResponse
    csrf_token: str


class LogoutResponse(BaseModel):
    logout_url: str
