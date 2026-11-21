from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Read from the environment, then `backend/.env`."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Serendipity API"
    debug: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
