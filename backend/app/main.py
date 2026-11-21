from fastapi import FastAPI

from app.config import get_settings
from app.routers import health

settings = get_settings()

# Every route lives under /api: the Next.js app proxies /api/* here (see next.config.ts).
app = FastAPI(
    title=settings.app_name,
    debug=settings.debug,
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)

app.include_router(health.router, prefix="/api")
