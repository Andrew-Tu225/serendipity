"""Insert the `fixtures` dataset into a database.

Fixture ids such as "p_01" are not UUIDs, so each maps to a stable uuid5;
ids that already are UUIDs (the viewer) are kept.
"""

from uuid import NAMESPACE_URL, UUID, uuid5

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Bookmark, Experience, Follow, Place, TasteProfile, User
from tests.recommend import fixtures as fx


def fixture_uuid(fixture_id: str) -> UUID:
    try:
        return UUID(fixture_id)
    except ValueError:
        return uuid5(NAMESPACE_URL, f"serendipity-fixture:{fixture_id}")


async def seed_fixture(session: AsyncSession, viewer_id: UUID | None = None) -> dict[str, UUID]:
    """Insert every fixture row and return fixture id -> database id.

    With `viewer_id`, the fixture viewer is that existing user (for example one
    created by a real login) instead of a new row.
    """
    fixture_ids = (
        *fx.USERS,
        *(p.id for p in fx.PLACES),
        *(log.id for log in fx.LOGS),
    )
    ids = {fixture_id: fixture_uuid(fixture_id) for fixture_id in fixture_ids}
    if viewer_id is not None:
        ids = {**ids, fx.VIEWER.id: viewer_id}

    session.add_all(
        User(id=ids[u.id], auth0_sub=f"fixture|{u.id}", display_name=u.display_name)
        for u in fx.USERS.values()
        if not (viewer_id is not None and u.id == fx.VIEWER.id)
    )
    session.add_all(
        Place(id=ids[p.id], name=p.name, lat=p.lat, lng=p.lng, category=p.category.value)
        for p in fx.PLACES
    )
    await session.flush()
    session.add_all(
        Experience(
            id=ids[log.id],
            user_id=ids[log.user_id],
            place_id=ids[log.place_id],
            rating=log.rating,
            verdict=log.verdict.value,
            review=log.review,
            photo_urls=list(log.photo_urls),
            visited_on=log.visited_on,
        )
        for log in fx.LOGS
    )
    session.add_all(
        Follow(follower_id=ids[f.follower_id], followee_id=ids[f.followee_id]) for f in fx.FOLLOWS
    )
    session.add_all(
        Bookmark(user_id=ids[b.user_id], place_id=ids[b.place_id]) for b in fx.BOOKMARKS
    )
    session.add_all(
        TasteProfile(user_id=ids[row.user_id], category=row.category.value, score=row.score)
        for row in fx.PROFILES
    )
    await session.commit()
    return ids
