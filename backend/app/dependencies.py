from datetime import UTC, date, datetime
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.database import get_database_session
from app.models import AuthSession, User
from app.repositories.recommendations import (
    RecommendationRepository,
    SqlRecommendationRepository,
)
from app.services.auth import AuthService
from app.services.recommendations import RecommendationService


def get_auth_service(
    database: Annotated[AsyncSession, Depends(get_database_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> AuthService:
    return AuthService(database, settings)


AuthServiceDependency = Annotated[AuthService, Depends(get_auth_service)]


async def get_current_user(request: Request, service: AuthServiceDependency) -> User:
    return await service.current_user(request)


async def require_csrf(request: Request, service: AuthServiceDependency) -> AuthSession:
    return await service.validate_csrf(request)


CurrentUser = Annotated[User, Depends(get_current_user)]
VerifiedMutation = Annotated[AuthSession, Depends(require_csrf)]


def get_recommendation_repository(
    database: Annotated[AsyncSession, Depends(get_database_session)],
) -> RecommendationRepository:
    return SqlRecommendationRepository(database)


def get_recommendation_service(
    repository: Annotated[RecommendationRepository, Depends(get_recommendation_repository)],
) -> RecommendationService:
    return RecommendationService(repository)


def get_today() -> date:
    return datetime.now(UTC).date()


RecommendationServiceDependency = Annotated[
    RecommendationService, Depends(get_recommendation_service)
]
Today = Annotated[date, Depends(get_today)]
