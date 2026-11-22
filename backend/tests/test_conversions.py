from uuid import UUID

import pytest

from app.models import User
from app.models.conversions import ANONYMOUS_NAME, to_domain_user

USER_ID = UUID("00000000-0000-0000-0000-0000000000aa")


def orm_user(display_name: str | None, picture_url: str | None = None) -> User:
    return User(id=USER_ID, auth0_sub="auth0|x", display_name=display_name, picture_url=picture_url)


def test_to_domain_user_maps_id_name_and_picture():
    user = to_domain_user(orm_user("Maya", "https://example.com/maya.png"))

    assert (user.id, user.display_name, user.avatar_url) == (
        str(USER_ID),
        "Maya",
        "https://example.com/maya.png",
    )


@pytest.mark.parametrize("name", [None, "", "   "])
def test_to_domain_user_falls_back_when_name_is_empty(name):
    assert to_domain_user(orm_user(name)).display_name == ANONYMOUS_NAME


def test_to_domain_user_cuts_long_names_to_60_characters():
    assert to_domain_user(orm_user("x" * 200)).display_name == "x" * 60
