import importlib.util
from datetime import date
from pathlib import Path
from uuid import UUID

import pytest
from sqlalchemy import select, text, update

from app.models import Experience, Place, User
from app.models.domain import Verdict, verdict_value

pytestmark = pytest.mark.anyio

MIGRATION = Path(__file__).resolve().parents[1] / "migrations/versions/0004_experience_value.py"


def backfill_sql() -> str:
    spec = importlib.util.spec_from_file_location("migration_0004", MIGRATION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.BACKFILL


CASES = [
    (Verdict.RECOMMEND, 2.0),
    (Verdict.AVOID, 5.0),
    (Verdict.NEUTRAL, 1.0),
    (Verdict.NEUTRAL, 3.5),
    (Verdict.NEUTRAL, 5.0),
]


async def test_backfill_matches_verdict_value(database_factory):
    async with database_factory() as session:
        session.add(User(id=UUID(int=1), auth0_sub="auth0|backfill"))
        session.add(Place(id=UUID(int=2), name="Spot", lat=43.6, lng=-79.4, category="park"))
        session.add_all(
            Experience(
                id=UUID(int=10 + i),
                user_id=UUID(int=1),
                place_id=UUID(int=2),
                rating=rating,
                verdict=verdict.value,
                photo_urls=[],
                visited_on=date(2026, 10, 1),
            )
            for i, (verdict, rating) in enumerate(CASES)
        )
        await session.commit()
        await session.execute(update(Experience).values(value=0.0))
        await session.execute(text(backfill_sql()))
        await session.commit()

        rows = (await session.scalars(select(Experience).order_by(Experience.id))).all()

    assert [row.value for row in rows] == [verdict_value(v, r) for v, r in CASES]
