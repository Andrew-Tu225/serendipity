from uuid import UUID

import pytest
from sqlalchemy import inspect, text

from app.models.domain import Verdict, verdict_value

CASES = [
    (Verdict.RECOMMEND, 2.0),
    (Verdict.AVOID, 5.0),
    (Verdict.NEUTRAL, 1.0),
    (Verdict.NEUTRAL, 3.5),
    (Verdict.NEUTRAL, 5.0),
]


@pytest.mark.anyio
@pytest.mark.parametrize("postgres_factory", ["0004", "0007"], indirect=True)
async def test_reconciles_experience_schema(postgres_factory, migrate_postgres):
    user_id = UUID(int=1)
    place_id = UUID(int=2)
    first_experience_id = UUID(int=10)
    async with postgres_factory() as session:
        revision = await session.scalar(text("SELECT version_num FROM alembic_version"))
        await session.execute(
            text("INSERT INTO users (id, auth0_sub) VALUES (:id, 'auth0|backfill')"),
            {"id": user_id},
        )
        await session.execute(
            text("""
                INSERT INTO places (id, name, lat, lng, category)
                VALUES (:id, 'Spot', 43.6, -79.4, 'park')
            """),
            {"id": place_id},
        )
        await session.execute(
            text("""
                INSERT INTO experiences
                    (id, user_id, place_id, rating, verdict, photo_urls, visited_on)
                VALUES (:id, :user_id, :place_id, :rating, :verdict, '[]', '2026-10-01')
            """),
            [
                {
                    "id": UUID(int=10 + index),
                    "user_id": user_id,
                    "place_id": place_id,
                    "rating": rating,
                    "verdict": verdict.value,
                }
                for index, (verdict, rating) in enumerate(CASES)
            ],
        )
        expected_values = [verdict_value(verdict, rating) for verdict, rating in CASES]
        if revision == "0007":
            # Reproduce the original Buddy branch's divergent revision 0004.
            await session.execute(
                text("DROP TABLE experience_likes, experience_bookmarks, experience_comments")
            )
            await session.execute(text("ALTER TABLE experiences ADD COLUMN value DOUBLE PRECISION"))
            # Deliberately differ from today's formula to verify that stored values survive.
            expected_values = [0.5] * len(CASES)
            await session.execute(text("UPDATE experiences SET value = 0.5"))
            await session.execute(text("ALTER TABLE experiences ALTER COLUMN value SET NOT NULL"))
            await session.execute(
                text("""
                    ALTER TABLE experiences ADD CONSTRAINT ck_experiences_value_range
                        CHECK (value BETWEEN -1 AND 1)
                """)
            )
        else:
            await session.execute(
                text("""
                    INSERT INTO experience_likes (user_id, experience_id)
                    VALUES (:user_id, :experience_id)
                """),
                {"user_id": user_id, "experience_id": first_experience_id},
            )

        connection = await session.connection()
        await connection.run_sync(migrate_postgres)
        assert await session.scalar(text("SELECT version_num FROM alembic_version")) == "0008"
        values = list(await session.scalars(text("SELECT value FROM experiences ORDER BY id")))
        assert values == expected_values
        likes = await session.scalar(text("SELECT count(*) FROM experience_likes"))
        assert likes == (1 if revision == "0004" else 0)
        assert await session.scalar(text("SELECT count(*) FROM experience_bookmarks")) == 0
        assert await session.scalar(text("SELECT count(*) FROM experience_comments")) == 0

        columns = await connection.run_sync(lambda conn: inspect(conn).get_columns("experiences"))
        value = next(column for column in columns if column["name"] == "value")
        assert value["nullable"] is False
        checks = await connection.run_sync(
            lambda conn: inspect(conn).get_check_constraints("experiences")
        )
        assert [check["name"] for check in checks].count("ck_experiences_value_range") == 1
