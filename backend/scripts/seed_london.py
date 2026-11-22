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
from app.integrations.google_places import GooglePlacesClient  # noqa: E402
from app.services.demo_data import DemoDataService  # noqa: E402
from app.services.fixture_places import FixturePlacesService  # noqa: E402
from scripts.local_database import local_database_url, target_label  # noqa: E402


async def main():
    parser = argparse.ArgumentParser(description="Add repeatable mock reviews for London, Ontario.")
    parser.add_argument(
        "--viewer-id",
        type=UUID,
        help="Validate an existing account ID (all local accounts receive six mutual friends).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Describe the fixtures without connecting or writing.",
    )
    parser.add_argument(
        "--link-google",
        action="store_true",
        help="Verify London destinations with Google and store matching Place IDs only.",
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
            if args.link_google:
                linked = await FixturePlacesService(
                    session, GooglePlacesClient(get_settings().backend_api_key_google)
                ).link()
                print("Place links: " + json.dumps(linked, sort_keys=True))
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
