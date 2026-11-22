import asyncio
from datetime import date
from uuid import uuid4

import pytest
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError

from app.models import (
    Bookmark,
    Experience,
    ExperienceBookmark,
    ExperienceComment,
    ExperienceLike,
    Follow,
    Place,
    User,
)
from app.schemas.social import PlaceBookmarkCreate
from app.services.social import SocialService

pytestmark = pytest.mark.anyio


@pytest.fixture
async def social_rows(postgres_factory):
    async with postgres_factory() as session:
        author = User(auth0_sub="test|social-author")
        viewer = User(auth0_sub="test|social-viewer")
        place = Place(name="Spot", lat=43.6, lng=-79.4, category="park")
        session.add_all([author, viewer, place])
        await session.flush()
        log = Experience(user_id=author.id, place_id=place.id, rating=5, visited_on=date.today())
        session.add(log)
        await session.commit()
        return viewer.id, author.id, place.id, log.id


@pytest.mark.parametrize("operation", ["like", "follow", "save_experience", "save_place"])
async def test_concurrent_relationship_adds_converge(postgres_factory, social_rows, operation):
    viewer_id, author_id, place_id, experience_id = social_rows

    async def write():
        async with postgres_factory() as session:
            viewer = await session.get(User, viewer_id)
            service = SocialService(session)
            if operation == "follow":
                return await service.follow(viewer, author_id)
            if operation == "save_place":
                return await service.save_place(viewer, PlaceBookmarkCreate(place_id=place_id))
            return await getattr(service, operation)(viewer, experience_id)

    results = await asyncio.gather(*(write() for _ in range(5)))
    model = {
        "like": ExperienceLike,
        "follow": Follow,
        "save_experience": ExperienceBookmark,
        "save_place": Bookmark,
    }[operation]
    async with postgres_factory() as session:
        assert await session.scalar(select(func.count()).select_from(model)) == 1
    if operation.startswith("save"):
        assert len({r.saved_at for r in results}) == 1


async def test_concurrent_bookmark_place_creation_converges(postgres_factory, social_rows):
    viewer_id, *_ = social_rows
    data = PlaceBookmarkCreate(
        new_place={
            "name": "New",
            "latitude": 43.6,
            "longitude": -79.4,
            "google_place_id": "shared-save-id",
        }
    )

    async def write():
        async with postgres_factory() as session:
            user = await session.get(User, viewer_id)
            return await SocialService(session).save_place(user, data)

    results = await asyncio.gather(*(write() for _ in range(5)))
    assert len({r.place.id for r in results}) == 1
    async with postgres_factory() as session:
        assert await session.scalar(select(func.count()).select_from(Place)) == 2
        assert await session.scalar(select(func.count()).select_from(Bookmark)) == 1
        assert await session.scalar(select(func.count()).select_from(Experience)) == 1


@pytest.mark.parametrize("target", ["place", "author", "viewer"])
async def test_foreign_keys_cascade_social_rows(postgres_factory, social_rows, target):
    viewer_id, author_id, place_id, experience_id = social_rows
    async with postgres_factory() as session:
        viewer = await session.get(User, viewer_id)
        service = SocialService(session)
        await service.like(viewer, experience_id)
        await service.save_experience(viewer, experience_id)
        await service.save_place(viewer, PlaceBookmarkCreate(place_id=place_id))
        await service.create_comment(viewer, experience_id, "Nice")
        await service.follow(viewer, author_id)
        if target == "place":
            await session.execute(delete(Place).where(Place.id == place_id))
        else:
            await session.execute(
                delete(User).where(User.id == (author_id if target == "author" else viewer_id))
            )
        await session.commit()
        for model in (ExperienceLike, ExperienceBookmark, ExperienceComment):
            assert await session.scalar(select(func.count()).select_from(model)) == 0
        assert await session.scalar(select(func.count()).select_from(Bookmark)) == (
            1 if target == "author" else 0
        )


@pytest.mark.parametrize("body", ["", "  ", "x" * 2001])
async def test_migrated_comment_body_constraint(postgres_factory, social_rows, body):
    viewer_id, _, _, experience_id = social_rows
    async with postgres_factory() as session:
        session.add(ExperienceComment(user_id=viewer_id, experience_id=experience_id, body=body))
        with pytest.raises(IntegrityError):
            await session.commit()


async def test_migrated_relationships_reject_duplicates_and_missing_targets(
    postgres_factory, social_rows
):
    viewer_id, _, _, experience_id = social_rows
    for model in (ExperienceLike, ExperienceBookmark):
        async with postgres_factory() as session:
            session.add(model(user_id=viewer_id, experience_id=experience_id))
            await session.commit()
        for target_id in (experience_id, uuid4()):
            async with postgres_factory() as session:
                session.add(model(user_id=viewer_id, experience_id=target_id))
                with pytest.raises(IntegrityError):
                    await session.commit()
