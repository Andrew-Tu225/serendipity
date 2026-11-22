from functools import lru_cache

from authlib.integrations.starlette_client import OAuth
from fastapi import HTTPException

from app.config import Settings, get_settings


def create_auth0_client(settings: Settings):
    if not all((settings.auth0_domain, settings.auth0_client_id, settings.auth0_client_secret)):
        raise HTTPException(503, "Auth0 is not configured")
    oauth = OAuth()
    return oauth.register(
        "auth0",
        client_id=settings.auth0_client_id,
        client_secret=settings.auth0_client_secret,
        server_metadata_url=f"{settings.auth0_issuer}.well-known/openid-configuration",
        client_kwargs={
            "scope": "openid profile email",
            "code_challenge_method": "S256",
            "timeout": 10,
        },
    )


@lru_cache
def get_auth0_client():
    return create_auth0_client(get_settings())
