"""Eight users with distinct tastes and 60 Toronto places.

Personas: hana and mei hike (not following each other), dev climbs, omar eats,
jay goes out, sofia lives in cafes, lin visits galleries, newcomer has nothing.
hana visits s_03 twice: recommend, then avoid; only the latest visit counts for
place scores, while both count toward her taste profile.
"""

from collections.abc import Sequence
from datetime import date, timedelta

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
from app.recommend.taste import apply_log, empty_profile

C = Category
TODAY = date(2026, 11, 21)

USERS = {
    u.id: u
    for u in (
        User(id="u_hana", display_name="Hana"),
        User(id="u_mei", display_name="Mei"),
        User(id="u_dev", display_name="Dev"),
        User(id="u_omar", display_name="Omar"),
        User(id="u_jay", display_name="Jay"),
        User(id="u_sofia", display_name="Sofia"),
        User(id="u_lin", display_name="Lin"),
        User(id="u_newcomer", display_name="Newcomer"),
    )
}

_PLACE_ROWS = (
    ("s_01", "Don Valley Trail", C.TRAIL),
    ("s_02", "Rouge Valley Trail", C.TRAIL),
    ("s_03", "Humber River Trail", C.TRAIL),
    ("s_04", "Taylor Creek Trail", C.TRAIL),
    ("s_05", "Crothers Woods", C.TRAIL),
    ("s_06", "High Park", C.PARK),
    ("s_07", "Trinity Bellwoods Park", C.PARK),
    ("s_08", "Toronto Island Park", C.PARK),
    ("s_09", "Riverdale Park East", C.PARK),
    ("s_10", "Scarborough Bluffs", C.VIEWPOINT),
    ("s_11", "Riverdale Hill Lookout", C.VIEWPOINT),
    ("s_12", "Polson Pier Lookout", C.VIEWPOINT),
    ("s_13", "Pai Northern Thai", C.RESTAURANT),
    ("s_14", "Banh Mi Boys", C.RESTAURANT),
    ("s_15", "Grey Gardens", C.RESTAURANT),
    ("s_16", "Seven Lives Tacos", C.RESTAURANT),
    ("s_17", "Bar Raval", C.BAR),
    ("s_18", "Civil Liberties", C.BAR),
    ("s_19", "Bar Pompette", C.BAR),
    ("s_20", "Pilot Coffee", C.CAFE),
    ("s_21", "Sam James Coffee", C.CAFE),
    ("s_22", "Dark Horse Espresso", C.CAFE),
    ("s_23", "Neo Coffee Bar", C.CAFE),
    ("s_24", "Jimmy's Coffee", C.CAFE),
    ("s_25", "Art Gallery of Ontario", C.GALLERY),
    ("s_26", "Power Plant Gallery", C.GALLERY),
    ("s_27", "Stephen Bulger Gallery", C.GALLERY),
    ("s_28", "Royal Ontario Museum", C.MUSEUM),
    ("s_29", "Bata Shoe Museum", C.MUSEUM),
    ("s_30", "Gardiner Museum", C.MUSEUM),
    ("s_31", "Another Story Bookshop", C.BOOKSTORE),
    ("s_32", "Type Books", C.BOOKSTORE),
    ("s_33", "BMV Books", C.BOOKSTORE),
    ("s_34", "Basecamp Climbing", C.CLIMBING),
    ("s_35", "Joe Rockheads", C.CLIMBING),
    ("s_36", "Hub Climbing", C.CLIMBING),
    ("s_37", "Academy of Lions", C.GYM),
    ("s_38", "Hone Fitness", C.GYM),
    ("s_39", "CN Tower", C.ATTRACTION),
    ("s_40", "Casa Loma", C.ATTRACTION),
    ("s_41", "Ripley's Aquarium", C.ATTRACTION),
    ("s_42", "St. Lawrence Market", C.SHOP),
    ("s_43", "Kensington Market", C.SHOP),
    ("s_44", "Distillery District", C.ATTRACTION),
    ("s_45", "Evergreen Brick Works", C.OTHER),
    ("s_46", "Graffiti Alley", C.OTHER),
    ("s_47", "Cherry Beach", C.PARK),
    ("s_48", "Leslie Street Spit", C.TRAIL),
    ("s_49", "Sugar Beach", C.PARK),
    ("s_50", "Bellwoods Brewery", C.BAR),
    ("s_51", "Mother Cocktail Bar", C.BAR),
    ("s_52", "Alo", C.RESTAURANT),
    ("s_53", "Kinton Ramen", C.RESTAURANT),
    ("s_54", "Rooster Coffee", C.CAFE),
    ("s_55", "Textile Museum", C.MUSEUM),
    ("s_56", "Design Exchange", C.GALLERY),
    ("s_57", "True North Climbing", C.CLIMBING),
    ("s_58", "Edwards Gardens", C.PARK),
    ("s_59", "Allan Gardens", C.ATTRACTION),
    ("s_60", "Spadina House", C.MUSEUM),
)

PLACES = tuple(
    Place(id=pid, name=name, lat=43.60 + i * 0.004, lng=-79.55 + i * 0.005, category=category)
    for i, (pid, name, category) in enumerate(_PLACE_ROWS)
)
CATEGORY_OF = {p.id: p.category for p in PLACES}
BBOX_ALL = "-80,43,-79,44"

# "R4.5" recommend, "A2" avoid, "4" neutral with that rating.
_VISITS: dict[str, Sequence[tuple[str, str]]] = {
    "u_hana": (
        ("s_01", "5"), ("s_02", "R4.5"), ("s_06", "4"), ("s_10", "R5"), ("s_11", "4.5"),
        ("s_47", "4"), ("s_20", "3.5"), ("s_39", "A2"), ("s_03", "R5"), ("s_03", "A2"),
    ),
    "u_mei": (
        ("s_01", "R5"), ("s_04", "5"), ("s_05", "R4.5"), ("s_12", "R5"), ("s_10", "4.5"),
        ("s_08", "4"), ("s_48", "R4"), ("s_58", "4.5"), ("s_21", "3"),
    ),
    "u_dev": (
        ("s_34", "R5"), ("s_35", "4.5"), ("s_36", "4"), ("s_37", "4"), ("s_10", "R5"),
        ("s_05", "4.5"), ("s_57", "R4.5"), ("s_02", "3"), ("s_38", "A2"),
    ),
    "u_omar": (
        ("s_13", "R5"), ("s_14", "4.5"), ("s_15", "R4.5"), ("s_16", "4"), ("s_52", "5"),
        ("s_17", "4"), ("s_20", "R4"), ("s_42", "R5"), ("s_53", "A1.5"), ("s_06", "3"),
    ),
    "u_jay": (
        ("s_17", "R5"), ("s_18", "R4.5"), ("s_19", "4.5"), ("s_50", "R4"), ("s_51", "A2"),
        ("s_13", "4"), ("s_16", "R4.5"), ("s_39", "4"), ("s_44", "R4"), ("s_41", "A1"),
    ),
    "u_sofia": (
        ("s_20", "R5"), ("s_21", "4.5"), ("s_22", "R4.5"), ("s_24", "4"), ("s_31", "R5"),
        ("s_32", "4"), ("s_07", "4.5"), ("s_06", "R4"), ("s_43", "4"), ("s_25", "4"),
    ),
    "u_lin": (
        ("s_25", "R5"), ("s_26", "4.5"), ("s_27", "R4.5"), ("s_28", "4"), ("s_29", "R4"),
        ("s_30", "4"), ("s_55", "R5"), ("s_33", "4.5"), ("s_56", "5"), ("s_46", "R4"),
        ("s_22", "3.5"), ("s_40", "A2"),
    ),
}  # fmt: skip


def _log(user_id: str, n: int, place_id: str, code: str) -> Experience:
    verdict = {"R": Verdict.RECOMMEND, "A": Verdict.AVOID}.get(code[0], Verdict.NEUTRAL)
    rating = float(code.lstrip("RA"))
    return Experience(
        id=f"x_{user_id[2:]}_{n:02d}",
        user_id=user_id,
        place_id=place_id,
        rating=rating,
        verdict=verdict,
        visited_on=date(2026, 9, 1) + timedelta(days=n * 5),
    )


# Every visit, oldest first per user, as `ExperienceService` would receive them.
ALL_LOGS = tuple(
    _log(user_id, n, place_id, code)
    for user_id, visits in _VISITS.items()
    for n, (place_id, code) in enumerate(visits)
)


def latest_per_user_and_place(logs: Sequence[Experience]) -> tuple[Experience, ...]:
    latest: dict[tuple[str, str], Experience] = {}
    for log in sorted(logs, key=lambda e: e.visited_on):
        latest = {**latest, (log.user_id, log.place_id): log}
    return tuple(latest.values())


LATEST_LOGS = latest_per_user_and_place(ALL_LOGS)

FOLLOWS = tuple(
    Follow(follower_id=a, followee_id=b)
    for a, b in (
        ("u_hana", "u_dev"),
        ("u_hana", "u_sofia"),
        ("u_mei", "u_dev"),
        ("u_dev", "u_hana"),
        ("u_omar", "u_sofia"),
        ("u_jay", "u_omar"),
        ("u_sofia", "u_lin"),
        ("u_sofia", "u_omar"),
        ("u_lin", "u_sofia"),
    )
)

BOOKMARKS = tuple(
    Bookmark(user_id=u, place_id=p)
    for u, p in (("u_sofia", "s_23"), ("u_hana", "s_12"), ("u_omar", "s_19"))
)


def _profiles() -> tuple[TasteProfile, ...]:
    rows: list[TasteProfile] = []
    for user_id in USERS:
        profile = empty_profile()
        for log in ALL_LOGS:
            if log.user_id == user_id:
                profile = apply_log(profile, log, CATEGORY_OF[log.place_id])
        rows += [
            TasteProfile(user_id=user_id, category=k, score=v) for k, v in profile.items() if v
        ]
    return tuple(rows)


PROFILES = _profiles()


def input_for(viewer_id: str, limit: int = 10) -> RecommendInput:
    return RecommendInput(
        viewer=USERS[viewer_id],
        users=USERS,
        follows=FOLLOWS,
        bookmarks=BOOKMARKS,
        places=PLACES,
        logs=LATEST_LOGS,
        profiles=PROFILES,
        limit=limit,
        today=TODAY,
    )
