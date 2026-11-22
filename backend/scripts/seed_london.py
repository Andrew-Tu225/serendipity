"""Seed local London demo data. Run directly or with `python -m scripts.seed_london`."""

import argparse
import asyncio
import json
import sys
from datetime import date
from pathlib import Path
from uuid import UUID

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy.exc import SQLAlchemyError  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.demo.london import PEOPLE, PLACES, experiences  # noqa: E402
from app.services.demo_data import DemoDataService  # noqa: E402
from scripts.local_database import local_database_url, target_label  # noqa: E402


async def main():
    parser = argparse.ArgumentParser(description="Add repeatable mock reviews for London, Ontario.")
    parser.add_argument(
        "--viewer-id",
        type=UUID,
        help="Optionally follow three demo users from this existing account.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Describe the fixtures without connecting or writing.",
    )
    args = parser.parse_args()
    try:
        url = local_database_url(get_settings().database_url)
    except ValueError as error:
        parser.error(str(error))
    print(f"Local target: {target_label(url)}")
    if args.dry_run:
        print(
            json.dumps(
                {
                    "users": len(PEOPLE),
                    "places": len(PLACES),
                    "experiences": len(experiences(date.today())),
                    "dry_run": True,
                }
            )
        )
        return
    engine = create_async_engine(url, connect_args={"connect_timeout": 5})
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as session:
            result = await DemoDataService(session).seed_london(date.today(), args.viewer_id)
        print("Inserted: " + json.dumps(result, sort_keys=True))
    except (SQLAlchemyError, ValueError) as error:
        message = (
            str(error)
            if isinstance(error, ValueError)
            else "Database operation failed. Check PostgreSQL and run alembic upgrade head."
        )
        raise SystemExit(message) from None
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
