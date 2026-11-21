"""Hand-built dataset for service tests.

Expected similarity to the viewer: kai ≈ 0.965, rin ≈ 0.938, zed = 0.
maya and leo are followed. Expected place scores:
p_01 ≈ 3.90, p_02 ≈ 1.43, p_10 ≈ 0.23, p_03 ≈ 0.035; p_04 nets negative.
Hidden gems (liked only by zed): p_05, p_06.
"""

from dataclasses import replace
from datetime import date

from app.models.domain import (
    Bookmark,
    Category,
    Experience,
    Follow,
    Place,
    TasteProfile,
    User,
    Verdict,
)
from app.recommend.service import RecommendInput

TODAY = date(2026, 11, 21)

VIEWER = User(id="u_viewer", display_name="Viewer")
MAYA = User(id="u_maya", display_name="Maya")
LEO = User(id="u_leo", display_name="Leo")
KAI = User(id="u_kai", display_name="Kai")
RIN = User(id="u_rin", display_name="Rin")
ZED = User(id="u_zed", display_name="Zed")
NEWCOMER = User(id="u_new", display_name="Newcomer")

USERS = {u.id: u for u in (VIEWER, MAYA, LEO, KAI, RIN, ZED, NEWCOMER)}

FOLLOWS = (
    Follow(follower_id=VIEWER.id, followee_id=MAYA.id),
    Follow(follower_id=VIEWER.id, followee_id=LEO.id),
)

BOOKMARKS = (
    Bookmark(user_id=VIEWER.id, place_id="p_08"),
    Bookmark(user_id=VIEWER.id, place_id="p_11"),
)


def _place(n: int, category: Category) -> Place:
    return Place(
        id=f"p_{n:02d}", name=f"Place {n}", lat=43.6 + n / 100, lng=-79.4, category=category
    )


PLACES = (
    _place(1, Category.TRAIL),
    _place(2, Category.CAFE),
    _place(3, Category.CAFE),
    _place(4, Category.TRAIL),
    _place(5, Category.MUSEUM),
    _place(6, Category.GALLERY),
    _place(7, Category.BAR),
    _place(8, Category.TRAIL),
    _place(9, Category.CAFE),
    _place(10, Category.TRAIL),
    _place(11, Category.PARK),
    _place(12, Category.VIEWPOINT),
)

_REC, _AVOID, _NEUTRAL = Verdict.RECOMMEND, Verdict.AVOID, Verdict.NEUTRAL

# (log id, author, place, rating, verdict, day of October 2026)
_LOG_ROWS = (
    ("e_01", MAYA, "p_01", 5.0, _REC, 1),
    ("e_02", LEO, "p_01", 4.5, _REC, 5),
    ("e_03", KAI, "p_01", 5.0, _REC, 3),
    ("e_04", RIN, "p_01", 5.0, _NEUTRAL, 4),
    ("e_05", ZED, "p_01", 5.0, _REC, 6),
    ("e_06", KAI, "p_02", 4.0, _REC, 2),
    ("e_07", RIN, "p_02", 4.0, _NEUTRAL, 3),
    ("e_08", MAYA, "p_03", 4.0, _REC, 4),
    ("e_09", KAI, "p_03", 2.0, _AVOID, 5),
    ("e_10", LEO, "p_04", 1.5, _AVOID, 6),
    ("e_11", RIN, "p_04", 4.0, _REC, 7),
    ("e_12", ZED, "p_05", 5.0, _REC, 8),
    ("e_13", ZED, "p_06", 4.0, _NEUTRAL, 9),
    ("e_14", ZED, "p_07", 1.0, _AVOID, 10),
    ("e_15", MAYA, "p_08", 5.0, _REC, 11),
    ("e_16", KAI, "p_09", 5.0, _REC, 12),
    ("e_17", VIEWER, "p_09", 4.0, _NEUTRAL, 13),
    ("e_18", RIN, "p_10", 3.5, _NEUTRAL, 14),
    ("e_19", ZED, "p_11", 5.0, _REC, 15),
)

LOGS = tuple(
    Experience(
        id=log_id,
        user_id=author.id,
        place_id=place_id,
        rating=rating,
        verdict=verdict,
        visited_on=date(2026, 10, day),
    )
    for log_id, author, place_id, rating, verdict, day in _LOG_ROWS
)


def _profile_rows(user: User, **scores: float) -> tuple[TasteProfile, ...]:
    return tuple(
        TasteProfile(user_id=user.id, category=Category(k), score=v) for k, v in scores.items()
    )


PROFILES = (
    *_profile_rows(VIEWER, trail=3.0, cafe=1.5, restaurant=-0.5),
    *_profile_rows(MAYA, trail=3.0, cafe=1.5, restaurant=-0.5),
    *_profile_rows(LEO, trail=2.0, cafe=2.0),
    *_profile_rows(KAI, trail=2.0, cafe=1.0, museum=0.5),
    *_profile_rows(RIN, trail=1.0, cafe=1.0),
    *_profile_rows(ZED, restaurant=4.0),
)

BASE_INPUT = RecommendInput(
    viewer=VIEWER,
    users=USERS,
    follows=FOLLOWS,
    bookmarks=BOOKMARKS,
    places=PLACES,
    logs=LOGS,
    profiles=PROFILES,
    limit=30,
    today=TODAY,
)

NEWCOMER_INPUT = replace(BASE_INPUT, viewer=NEWCOMER, follows=(), bookmarks=())
