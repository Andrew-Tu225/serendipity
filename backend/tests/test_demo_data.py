import subprocess
import sys
from datetime import date
from pathlib import Path
from uuid import uuid4

import pytest
from sqlalchemy import func, select, text

from app.demo.london import PEOPLE, PLACES, demo_id, experiences
from app.models import Experience, Follow, Place, TasteProfile, User
from app.recommend.taste import log_value
from app.repositories.demo_data import DemoDataRepository
from app.repositories.experiences import TasteProfileRepository
from app.schemas.recommendations import BBox
from app.services.demo_data import DemoDataService
from app.services.discovery import DiscoveryService
from scripts.local_database import local_database_url, target_label

pytestmark = pytest.mark.anyio


async def test_seed_is_complete_idempotent_and_preserves_existing_data(database_factory):
    async with database_factory() as session:
        real_user = User(auth0_sub="auth0|keep", display_name="Real user")
        real_place = Place(name="Existing place", lat=45, lng=-79, category="cafe")
        session.add_all([real_user, real_place])
        await session.commit()
        first = await DemoDataService(session).seed_london(date.today())
        assert first == {
            "users": 20,
            "places": 24,
            "experiences": 171,
            "follows": 40,
            "bookmarks": 60,
        }
        rows = (await session.scalars(select(TasteProfile))).all()
        scores = {(row.user_id, row.category): row.score for row in rows}
        second = await DemoDataService(session).seed_london(date.today())
        assert all(count == 0 for count in second.values())
        await session.refresh(real_user)
        await session.refresh(real_place)
        assert real_user.display_name == "Real user" and real_place.name == "Existing place"
        rows = (await session.scalars(select(TasteProfile))).all()
        assert {(row.user_id, row.category): row.score for row in rows} == scores
        assert (
            await session.scalars(select(Follow).where(Follow.follower_id == real_user.id))
        ).all() == []


async def test_taste_scores_equal_inserted_mock_logs(database_factory):
    async with database_factory() as session:
        await DemoDataService(session).seed_london(date.today())
        rows = (await session.scalars(select(TasteProfile))).all()
        categories = {str(demo_id(f"place:{place.slug}")): place.category.value for place in PLACES}
        expected = {}
        for log in experiences(date.today()):
            key = (log.user_id, categories[log.place_id])
            expected[key] = expected.get(key, 0) + log_value(log)
        assert {(str(row.user_id), row.category): row.score for row in rows} == expected


async def test_viewer_follows_and_public_discovery(database_factory):
    async with database_factory() as session:
        viewer = User(auth0_sub="auth0|viewer")
        session.add(viewer)
        await session.commit()
        inserted = await DemoDataService(session).seed_london(date.today(), viewer.id)
        assert inserted["follows"] == 43
        bounds = BBox(min_lng=-81.35, min_lat=42.93, max_lng=-81.20, max_lat=43.03)
        public = await DiscoveryService(session).discover(bounds, None, 200, None)
        assert len(public.places) == 24
        expected_reviewers = {}
        for log in experiences(date.today()):
            expected_reviewers.setdefault(log.place_id, set()).add(log.user_id)
        assert all(
            place.rating_summary.count == len(expected_reviewers[str(place.id)])
            for place in public.places
        )
        assert all(place.friend_count == 0 for place in public.places)
        private = await DiscoveryService(session).discover(bounds, None, 200, viewer)
        assert any(place.friend_count > 0 for place in private.places)
        for place in private.places:
            for review in place.friends:
                assert review.author_name.startswith("Demo ")
                assert review.review.startswith("[Mock review]")
        again = await DemoDataService(session).seed_london(date.today(), viewer.id)
        assert all(count == 0 for count in again.values())


async def test_unknown_viewer_does_not_partially_seed(database_factory):
    async with database_factory() as session:
        with pytest.raises(ValueError, match="does not exist"):
            await DemoDataService(session).seed_london(date.today(), uuid4())
        assert all(count == 0 for count in (await DemoDataRepository(session).counts()).values())


async def test_seed_failure_rolls_back_the_entire_dataset(database_factory, monkeypatch):
    async def fail(*args):
        raise RuntimeError("Simulated failure")

    monkeypatch.setattr(TasteProfileRepository, "add_score", fail)
    async with database_factory() as session:
        with pytest.raises(RuntimeError, match="Simulated failure"):
            await DemoDataService(session).seed_london(date.today())
        assert all(count == 0 for count in (await DemoDataRepository(session).counts()).values())


async def test_clear_removes_all_app_rows_and_retains_schema(postgres_factory):
    async with postgres_factory() as session:
        await DemoDataService(session).seed_london(date.today())
        version = await session.scalar(text("SELECT version_num FROM alembic_version"))
        counts = await DemoDataService(session).clear()
        assert counts["places"] == 24 and counts["experiences"] == 171
        assert all(count == 0 for count in (await DemoDataRepository(session).counts()).values())
        assert await session.scalar(text("SELECT version_num FROM alembic_version")) == version
        assert (await DemoDataService(session).seed_london(date.today()))["places"] == 24


@pytest.mark.parametrize(
    "url",
    [
        "",
        "not-a-url",
        "sqlite:///test.db",
        "postgresql+psycopg://user:secret@remote.example/serendipity",
        "postgresql+psycopg:///serendipity",
        "postgresql+psycopg://localhost/serendipity?host=remote.example",
        "postgresql+psycopg://localhost/serendipity?hostaddr=1.2.3.4",
        "postgresql+psycopg://localhost/serendipity?service=production",
        "postgresql+psycopg://localhost/serendipity?dbname=other",
    ],
)
async def test_maintenance_rejects_remote_or_overridden_targets(url):
    with pytest.raises(ValueError):
        local_database_url(url)


async def test_local_target_label_never_contains_credentials():
    url = local_database_url("postgresql+psycopg://username:secret@127.0.0.1:5433/serendipity")
    assert target_label(url) == "127.0.0.1:5433/serendipity"
    assert len(PEOPLE) >= 20


async def test_every_demo_user_has_at_least_five_reviews():
    logs = experiences(date.today())
    assert len(logs) >= 100
    assert len({log.id for log in logs}) == len(logs)
    for person in PEOPLE:
        authored = [log for log in logs if log.user_id == str(demo_id(f"user:{person}"))]
        assert len(authored) >= 5
        assert all(log.review.startswith("[Mock review]") for log in authored)


async def test_seed_expands_original_dataset_without_rewriting_reviews(
    database_factory, monkeypatch
):
    async with database_factory() as session:
        with monkeypatch.context() as patch:
            patch.setattr("app.demo.london.PEOPLE", PEOPLE[:6])
            patch.setattr("app.services.demo_data.PEOPLE", PEOPLE[:6])
            original = await DemoDataService(session).seed_london(date.today())
        assert original["users"] == 6 and original["experiences"] == 101
        previous = {
            row.id: (row.user_id, row.place_id, row.rating, row.review, row.visited_on)
            for row in (await session.scalars(select(Experience))).all()
        }
        expanded = await DemoDataService(session).seed_london(date.today())
        assert expanded["users"] == 14 and expanded["experiences"] == 70
        current = {
            row.id: (row.user_id, row.place_id, row.rating, row.review, row.visited_on)
            for row in (await session.scalars(select(Experience))).all()
        }
        assert {key: current[key] for key in previous} == previous
        assert all(
            count == 0
            for count in (await DemoDataService(session).seed_london(date.today())).values()
        )


async def test_clear_cli_requires_confirmation_before_connecting(monkeypatch):
    monkeypatch.setenv(
        "DATABASE_URL", "postgresql+psycopg://username:secret@127.0.0.1:1/serendipity"
    )
    script = Path(__file__).resolve().parents[1] / "scripts" / "clear_local_db.py"
    for arguments in ([], ["--confirm", "wrong-db"]):
        result = subprocess.run(
            [sys.executable, str(script), *arguments], capture_output=True, text=True
        )
        assert result.returncode == 2
        assert "--confirm serendipity" in result.stderr
        assert "secret" not in result.stdout + result.stderr
        assert "Database operation failed" not in result.stderr


async def test_seeded_logs_store_the_values_summed_into_profiles(database_factory):
    async with database_factory() as session:
        await DemoDataService(session).seed_london(date.today())
        sums = (
            await session.execute(
                select(Experience.user_id, Place.category, func.sum(Experience.value))
                .join(Place, Place.id == Experience.place_id)
                .group_by(Experience.user_id, Place.category)
            )
        ).all()
        rows = (await session.scalars(select(TasteProfile))).all()

    assert {(u, c): pytest.approx(total) for u, c, total in sums} == {
        (row.user_id, row.category): row.score for row in rows
    }
