"""Clear application rows in local PostgreSQL, retaining the migrated schema."""

import argparse
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy.exc import SQLAlchemyError  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.repositories.demo_data import DemoDataRepository  # noqa: E402
from app.services.demo_data import DemoDataService  # noqa: E402
from scripts.local_database import local_database_url, target_label  # noqa: E402


async def main():
    parser = argparse.ArgumentParser(
        description="Delete all app rows, including users/sessions, from local PostgreSQL."
    )
    parser.add_argument(
        "--confirm",
        metavar="DATABASE_NAME",
        help="Required for deletion; must equal the configured database name.",
    )
    parser.add_argument(
        "--dry-run", action="store_true", help="Show row counts without deleting anything."
    )
    args = parser.parse_args()
    try:
        url = local_database_url(get_settings().database_url)
    except ValueError as error:
        parser.error(str(error))
    print(f"Local target: {target_label(url)}")
    if not args.dry_run and args.confirm != url.database:
        parser.error(
            f"To delete app data, pass --confirm {url.database}. "
            "Use --dry-run to inspect row counts."
        )
    engine = create_async_engine(url, connect_args={"connect_timeout": 5})
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as session:
            counts = (
                await DemoDataRepository(session).counts()
                if args.dry_run
                else await DemoDataService(session).clear()
            )
        print(
            ("Would delete: " if args.dry_run else "Deleted: ") + json.dumps(counts, sort_keys=True)
        )
    except SQLAlchemyError:
        raise SystemExit(
            "Database operation failed. Check PostgreSQL and run alembic upgrade head."
        ) from None
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
