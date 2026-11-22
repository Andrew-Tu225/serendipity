from sqlalchemy.engine import URL, make_url


def local_database_url(value: str) -> URL:
    if not value:
        raise ValueError("Set DATABASE_URL in backend/.env first.")
    try:
        url = make_url(value)
    except Exception:
        raise ValueError("DATABASE_URL is not a valid SQLAlchemy URL.") from None
    if url.drivername != "postgresql+psycopg":
        raise ValueError("These scripts require PostgreSQL with the Psycopg driver.")
    if url.host not in {"localhost", "127.0.0.1", "::1"} or not url.database:
        raise ValueError(
            "These scripts only support explicitly configured loopback PostgreSQL hosts."
        )
    # libpq query options can override the host/database shown in the main URL.
    if set(url.query) & {
        "host",
        "hostaddr",
        "port",
        "service",
        "servicefile",
        "dbname",
        "database",
    }:
        raise ValueError("Connection target overrides in DATABASE_URL are not supported.")
    return url


def target_label(url: URL) -> str:
    return f"{url.host}:{url.port or 5432}/{url.database}"
