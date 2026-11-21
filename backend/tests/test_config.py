import pytest
from pydantic import ValidationError

from app.config import Settings


def test_remote_origin_requires_https_and_secure_cookies():
    with pytest.raises(ValidationError):
        Settings(_env_file=None, app_base_url="http://example.com")
    with pytest.raises(ValidationError):
        Settings(_env_file=None, app_base_url="https://example.com", cookie_secure=False)
    settings = Settings(_env_file=None, app_base_url="https://example.com", cookie_secure=True)
    assert settings.cookie_secure


@pytest.mark.parametrize(
    "origin",
    [
        "https://example.com/path",
        "https://user:password@example.com",
        "https://example.com?query=1",
    ],
)
def test_origin_cannot_contain_paths_or_credentials(origin):
    with pytest.raises(ValidationError):
        Settings(_env_file=None, app_base_url=origin)
