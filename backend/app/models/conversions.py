"""Database rows -> domain models (`app.models.domain`) used by the recommender."""

from app.models import domain
from app.models.auth import User
from app.models.experiences import Experience, TasteProfile
from app.models.places import Bookmark, Place
from app.models.social import Follow

ANONYMOUS_NAME = "Anonymous"
MAX_DISPLAY_NAME_CHARS = 60


def to_domain_user(user: User) -> domain.User:
    """The stored name is optional and unbounded; the domain name is 1-60 characters."""
    name = (user.display_name or "").strip()[:MAX_DISPLAY_NAME_CHARS].rstrip()
    return domain.User(
        id=str(user.id), display_name=name or ANONYMOUS_NAME, avatar_url=user.picture_url
    )


def to_domain_place(place: Place) -> domain.Place:
    return domain.Place(
        id=str(place.id),
        name=place.name,
        lat=place.lat,
        lng=place.lng,
        category=domain.Category(place.category),
    )


def to_domain_experience(row: Experience) -> domain.Experience:
    return domain.Experience(
        id=str(row.id),
        user_id=str(row.user_id),
        place_id=str(row.place_id),
        rating=row.rating,
        verdict=domain.Verdict(row.verdict),
        review=row.review,
        photo_urls=tuple(row.photo_urls),
        visited_on=row.visited_on,
    )


def to_domain_follow(row: Follow) -> domain.Follow:
    return domain.Follow(follower_id=str(row.follower_id), followee_id=str(row.followee_id))


def to_domain_bookmark(row: Bookmark) -> domain.Bookmark:
    return domain.Bookmark(user_id=str(row.user_id), place_id=str(row.place_id))


def to_domain_profile(row: TasteProfile) -> domain.TasteProfile:
    return domain.TasteProfile(
        user_id=str(row.user_id), category=domain.Category(row.category), score=row.score
    )
