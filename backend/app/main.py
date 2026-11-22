from fastapi import FastAPI, Request
from sqlalchemy.exc import SQLAlchemyError
from starlette.responses import JSONResponse

from app.api import auth, discovery, health, lists, places, recommendations
from app.config import get_settings

settings = get_settings()

# Every route lives under /api: the Next.js app proxies /api/* here (see next.config.ts).
app = FastAPI(
    title=settings.app_name,
    debug=settings.debug,
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)

app.include_router(health.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
app.include_router(places.router, prefix="/api")
app.include_router(recommendations.router, prefix="/api")
app.include_router(discovery.router, prefix="/api")
app.include_router(lists.router, prefix="/api")

NO_STORE_PREFIXES = ("/api/auth/", "/api/places/", "/api/discovery/", "/api/lists", "/api/users/")


@app.middleware("http")
async def protect_auth_responses(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.startswith(NO_STORE_PREFIXES):
        response.headers["Cache-Control"] = "no-store"
        response.headers["Pragma"] = "no-cache"
        response.headers["Referrer-Policy"] = "no-referrer"
    return response


@app.exception_handler(SQLAlchemyError)
async def database_unavailable(request: Request, error: SQLAlchemyError):
    return JSONResponse(status_code=503, content={"detail": "Database is unavailable"})
