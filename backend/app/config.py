from functools import lru_cache
from pathlib import Path

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Read from the environment, then `backend/.env`."""

    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[1] / ".env", extra="ignore"
    )

    app_name: str = "Serendipity API"
    debug: bool = False
    database_url: str = ""
    app_base_url: str = "http://localhost:3000"
    auth0_domain: str = ""
    auth0_client_id: str = ""
    auth0_client_secret: str = ""
    cookie_secure: bool = False
    session_cookie_name: str = "serendipity_session"
    session_lifetime_seconds: int = 8 * 60 * 60
    login_lifetime_seconds: int = 10 * 60
    backend_api_key_google: str = ""

    @field_validator("auth0_domain")
    @classmethod
    def validate_domain(cls, value: str) -> str:
        value = value.strip().removeprefix("https://").rstrip("/")
        if value and ("/" in value or ":" in value or "?" in value or "#" in value):
            raise ValueError("AUTH0_DOMAIN must be a hostname")
        return value

    @field_validator("app_base_url")
    @classmethod
    def validate_origin(cls, value: str) -> str:
        from urllib.parse import urlsplit

        value = value.rstrip("/")
        parts = urlsplit(value)
        if parts.scheme not in {"http", "https"} or not parts.netloc:
            raise ValueError("APP_BASE_URL must be an HTTP(S) origin")
        if parts.path or parts.query or parts.fragment or parts.username or parts.password:
            raise ValueError("APP_BASE_URL must contain only the origin")
        return value

    @model_validator(mode="after")
    def validate_cookie_transport(self) -> "Settings":
        from urllib.parse import urlsplit

        if urlsplit(self.app_base_url).hostname not in {"localhost", "127.0.0.1", "::1"}:
            if not self.app_base_url.startswith("https://") or not self.cookie_secure:
                raise ValueError("Non-local deployments require HTTPS and COOKIE_SECURE=true")
        if self.session_lifetime_seconds <= 0 or self.login_lifetime_seconds <= 0:
            raise ValueError("Session lifetimes must be positive")
        return self

    @property
    def auth0_issuer(self) -> str:
        return f"https://{self.auth0_domain}/"


@lru_cache
def get_settings() -> Settings:
    return Settings()
