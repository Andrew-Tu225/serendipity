from typing import Annotated, Any

from authlib.integrations.base_client.errors import OAuthError
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from httpx2 import HTTPError
from joserfc.errors import JoseError
from sqlalchemy.exc import SQLAlchemyError
from starlette.responses import RedirectResponse

from app.dependencies import AuthServiceDependency
from app.integrations.auth0 import get_auth0_client
from app.schemas.auth import LogoutResponse, SessionResponse

router = APIRouter(prefix="/auth", tags=["auth"])
Provider = Annotated[Any, Depends(get_auth0_client)]


def set_session_cookie(response: Response, service: Any, token: str, max_age: int) -> None:
    response.set_cookie(
        service.settings.session_cookie_name,
        token,
        max_age=max_age,
        httponly=True,
        secure=service.settings.cookie_secure,
        samesite="lax",
        path="/",
    )


def clear_session_cookie(response: Response, service: Any) -> None:
    response.delete_cookie(
        service.settings.session_cookie_name,
        path="/",
        httponly=True,
        secure=service.settings.cookie_secure,
        samesite="lax",
    )


@router.get("/login")
async def login(request: Request, service: AuthServiceDependency, provider: Provider):
    try:
        response, token = await service.start_login(request, provider)
    except (HTTPError, OAuthError) as error:
        raise HTTPException(503, "Authentication provider is unavailable") from error
    set_session_cookie(response, service, token, service.settings.login_lifetime_seconds)
    return response


@router.get("/callback")
async def callback(request: Request, service: AuthServiceDependency, provider: Provider):
    try:
        token = await service.finish_login(request, provider)
    except (OAuthError, JoseError, HTTPException, ValueError):
        await service.database.rollback()
        response = RedirectResponse(
            f"{service.settings.app_base_url}/login?error=authentication_failed", status_code=303
        )
        clear_session_cookie(response, service)
        return response
    except (HTTPError, SQLAlchemyError):
        await service.database.rollback()
        response = RedirectResponse(
            f"{service.settings.app_base_url}/login?error=authentication_unavailable",
            status_code=303,
        )
        clear_session_cookie(response, service)
        return response
    response = RedirectResponse(f"{service.settings.app_base_url}/", status_code=303)
    set_session_cookie(response, service, token, service.settings.session_lifetime_seconds)
    return response


@router.get("/me", response_model=SessionResponse)
async def me(request: Request, service: AuthServiceDependency) -> SessionResponse:
    return await service.get_session(request)


@router.post("/logout", response_model=LogoutResponse)
async def logout(
    request: Request, response: Response, service: AuthServiceDependency
) -> LogoutResponse:
    logout_url = await service.logout(request)
    clear_session_cookie(response, service)
    return LogoutResponse(logout_url=logout_url)
