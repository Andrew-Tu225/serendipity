# Serendipity

**Discover the world through the experiences of people you trust.**

Serendipity is a map-first social discovery app: Letterboxd for real-world places. Instead of ranking places by thousands of stranger reviews, your map is shaped by what your friends have visited, reviewed, and recommended.

Built for a hackathon on the theme **Discovering the Unknown**: not undiscovered places, but places that are unknown *to you*, like the café two streets over or the trail a friend loves.

## What it does

- **Social map**: an interactive map where markers show places friends recommended, places friends reviewed, places you bookmarked, and possible hidden gems.
- **Experiences**: log a visit to any place (restaurant, trail, climbing gym, museum, viewpoint) with a rating, a written review, photos, and whether you'd recommend it.
- **Friends**: see the places your friends have been and what they thought, both good and bad.
- **Bookmarks**: save a place the moment someone mentions it, so recommendations stop getting lost in DMs and notes apps.

The core loop: **Discover → Save → Experience → Review → Share → someone else discovers.**

The full concept, user story, and open design questions are in [docs/plan.md](docs/plan.md).

## Tech stack

- **Frontend:** [Next.js 16](https://nextjs.org) (App Router, Turbopack) with React 19, TypeScript, and [Tailwind CSS v4](https://tailwindcss.com)
- **Backend:** [FastAPI](https://fastapi.tiangolo.com) on Python 3.11+, managed with [uv](https://docs.astral.sh/uv/)

The Next.js app proxies `/api/*` to FastAPI. Authentication uses Auth0 with server-managed sessions; PostgreSQL runs locally through Docker Compose. Maps use Google Maps JavaScript API and Places API (New). Image storage is still to be decided.

## Getting started

Requires Node.js 20.9+, Python 3.11+, [uv](https://docs.astral.sh/uv/getting-started/installation/), and a running Docker Desktop/Engine.

Copy the configuration examples once; preserve any existing local values:

```bash
cp backend/.env.example backend/.env
cp .env.example .env.local
npm install
```

Start Postgres and apply migrations:

```bash
docker compose --env-file backend/.env up -d db
cd backend
uv sync
uv run alembic upgrade head
```

The default development database is `serendipity`, with username `serendipity` and password `serendipity_dev`, bound to `127.0.0.1:5433` (to avoid an existing Postgres server on port 5432). Keep `POSTGRES_*` and `DATABASE_URL` consistent if changing them. Port changes use `POSTGRES_PORT` with `--env-file` as shown above. The named volume preserves data across container restarts. `docker compose stop db` stops the database without deleting it. Database credentials are fixed when its volume is first initialized.

### Auth0 setup

Create an Auth0 account/development tenant and a **Regular Web Application** named **Serendipity Web**. Enable the database email/password connection and allow signup. Set these exact application URLs:

| Auth0 setting | Local value |
|---|---|
| Allowed Callback URLs | `http://localhost:3000/api/auth/callback` |
| Allowed Logout URLs | `http://localhost:3000/login` |
| Application Login URI | `http://localhost:3000/api/auth/login` |

Set `AUTH0_DOMAIN` (tenant hostname), `AUTH0_CLIENT_ID`, and `AUTH0_CLIENT_SECRET` in `backend/.env`. The backend requests `openid profile email`. This session-based version does not require a separate Auth0 API registration or frontend Auth0 SDK.

For MCP-assisted provisioning, register the official server in Codex:

```bash
codex mcp add auth0 -- npx -y @auth0/auth0-mcp-server run
```

Authenticate the server using the official `npx -y @auth0/auth0-mcp-server init` flow (the current tool may also offer to configure a different MCP client; Codex is already registered by the command above). Restart Codex to load its tools, then create/configure the application through MCP. Account signup and browser authorization require your participation. Do not commit credentials or paste a client secret into chat.

For deployment, set `APP_BASE_URL` to the public HTTPS origin and `COOKIE_SECURE=true`, update the Auth0 URLs, and provide a protected Postgres connection. Non-local HTTP or insecure cookies are rejected by configuration validation.

### Run the app

Run the backend and frontend in two terminals:

```bash
# terminal 1: backend
cd backend
uv sync
uv run fastapi dev app/main.py   # http://127.0.0.1:8000, API docs at /api/docs

# terminal 2: frontend
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). [http://localhost:3000/api/health](http://localhost:3000/api/health) should return `{"status":"ok"}` through the proxy.

Open [http://localhost:3000](http://localhost:3000). Signed-out visitors are sent to `/login`, whose button opens Auth0. After signup/sign-in, FastAPI validates the ID token, upserts the user, rotates the session, and redirects to `/`. First-time accounts must choose at least one place-category interest at `/onboarding`; completed accounts go straight home. `/success` redirects to `/` for old links. Home shows review-backed recommendations around London, Ontario, and Profile shows the signed-in identity, real counts, and selected interests. Profile fields can be absent; email verification is not required. Sign out from Profile to revoke the local session and end Auth0's browser session.

Run `cd backend && uv run alembic upgrade head` before starting the updated backend. Migration `0005` adds persisted interests and onboarding completion; existing accounts complete setup once. No new environment variables or dependencies are required.

Sessions expire after 8 hours; temporary login attempts expire after 10 minutes. Expired rows are removed when a new login starts. A blocked/deleted Auth0 account does not automatically revoke an existing local session; immediate account-wide revocation can be added later.

### Google discovery map

Discover fills the phone above navigation, with floating search and place previews. The Next.js
development badge is disabled to keep those controls clear; compile/runtime errors still surface.

Discover uses Google Maps JavaScript API with custom Advanced Markers and public place search
through FastAPI's Places API (New) integration. Set these values before starting the servers:

- `.env.local`: `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` and `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`.
- `backend/.env`: `BACKEND_API_KEY_GOOGLE` (server-only).

Enable **Maps JavaScript API** and **Places API (New)** in a billing-enabled Google Cloud project.
Restrict the browser key to Maps JavaScript API and your development/production website origins.
Restrict the backend key to Places API (New), and server egress IPs where available. The browser
key is intentionally public; never prefix the backend key with `NEXT_PUBLIC_`.

Create a JavaScript **vector Map ID**, import [the map style](docs/google-map-style.json) into
Google's cloud style editor, publish it, and associate it with that Map ID. See
[the setup and behavior guide](docs/discovery-map.md) for details. Local development falls back
to Google's `DEMO_MAP_ID`, which shows Google's default map style. Production requires an explicit
Map ID. Restart the frontend after environment changes; `NEXT_PUBLIC_*` values are bundled at build time.

Search, details, and nearby destination discovery are available without login or a database.
Nearby places use matching custom category markers, even without app reviews. Neighborhood searches
reuse temporary geographic cells; wider views retain app-reviewed places to limit paid Google calls.
The existing backend key must allow Places API (New) Nearby Search; no new environment values are needed.
Discover initially centers on London, Ontario.
Run `npm install` for the marker clustering dependency and `cd backend && uv run alembic upgrade head`
before using app-reviewed places. Migration 0003 links app Places to optional Google IDs; migration
0002 supplies Places, Experiences, and follows. The map loads every app-reviewed Place in view from
PostgreSQL. Visitors can browse public reviews; signed-in users can write reviews and see followed
users highlighted. Use Add to name a new Place and choose its map point, or Write a review on an
existing marker. An empty database can still show Google nearby destinations; app ratings appear after
reviews are submitted. No demo data is inserted
automatically. Photos, saving UI, friend-management UI, and filters are deferred. See
[the database discovery guide](docs/discovery-data.md).

### Social endpoints (backend only)

Likes, editable comments, private saved reviews/Places, directed follows, public profiles/user
search, and a following review feed are available through FastAPI. Run
`cd backend && uv run alembic upgrade head` to apply migration `0004` before using them. No new
dependencies or environment variables are required. UI integration remains separate.
See [the social API reference](docs/social-api.md) for routes, request/response fields, pagination,
and session/CSRF requirements, or inspect `/api/docs` on the backend.

### Local mock reviews

From the repository root, run `npm run db:seed` to insert 20 demo users, 24 London places, and 171 labeled mock
reviews. Every demo user has at least five reviews. The seed is repeatable and preserves existing data. Use
`npm run db:seed -- --viewer-id YOUR_USER_UUID` to follow three demo users from an existing account.

`npm run db:clear -- --dry-run` shows app row counts. `npm run db:clear -- --confirm serendipity`
deletes all app data, including users and sessions, from the configured local database while keeping
its schema and migrations. Replace the confirmation name if your database has a different name.
The clear command is provided for explicit use; seeding does not clear your data first. Both commands
require the existing backend virtual environment and reject remote database hosts. See
[the seed/reset guide](docs/local-demo-data.md) for details and backend `uv` equivalents.

### Application layers

```text
UI → typed frontend API client → FastAPI router → service → repository → Postgres
```

Domain clients centralize HTTP, credentials, CSRF headers, and typed errors. Backend endpoint modules live in `backend/app/api/`; their routers validate requests/responses, services own business rules and commits, and repositories own SQLAlchemy queries. User creation starts at `GET /api/auth/callback` in `api/auth.py`, which calls the auth service and then the user repository. Auth0 HTTP integration is separate from database repositories. Future protected routes use `CurrentUser`; mutations also use `VerifiedMutation` and check ownership in their service. The same-origin proxy is transport, not an authorization boundary.

See [docs/architecture.md](docs/architecture.md) for the full repository flow and guidance for adding features.

| Endpoint | Behavior |
|---|---|
| `GET /api/auth/login` | Starts Auth0 login/signup |
| `GET /api/auth/callback` | Validates callback, persists user/session, redirects |
| `GET /api/auth/me` | Returns `{ auth0, user, csrf_token }`; requires a valid session |
| `GET /api/me/profile` | Signed-in identity, interests, completion, Experience/saved Place/following counts |
| `PUT /api/me/onboarding` | CSRF-protected `{ interests: Category[] }`; 1–14 unique categories; replaces interests and completes setup |
| `POST /api/auth/logout` | Requires matching Origin and X-CSRF-Token; revokes session and returns `{ logout_url }` |

Auth responses use `Cache-Control: no-store`. Session cookies are HttpOnly, SameSite=Lax, host-only, and Secure in production. The page never renders the CSRF token. No passwords, raw ID/access tokens, or OAuth verifiers are returned by the session endpoint.

### Tests

```bash
npm run lint
npm run build
npm run test:browser
cd backend
uv run pytest
uv run ruff check .
uv run ruff format --check .
```

The backend suite uses isolated SQLite databases and a mocked OIDC provider with real RSA-signed tokens. To also run PostgreSQL concurrency tests, set `TEST_DATABASE_URL` to a PostgreSQL SQLAlchemy URL and run pytest. Those tests create and remove their own unique schema, leaving application tables untouched. A separate disposable database is recommended for testing migrations.

Browser tests mock the auth API, Google Maps SDK, Places responses, and discovery/review HTTP responses, and run a dedicated Next.js server on port 3039 with `.next-auth-test` output and dummy Maps credentials. Install Chromium once with `npx playwright install chromium`. `TEST_BASE_URL` can target an existing test server configured with a browser map key and Map ID. `SERENDIPITY_DIST_DIR` optionally isolates other Next.js builds from a running dev server.

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | Run ESLint |
| `npm run db:seed` | Insert repeatable London mock reviews in local PostgreSQL |
| `npm run db:clear -- --confirm serendipity` | Clear all local app rows, retaining schema |
| `uv run pytest` (in `backend/`) | Run backend tests |
| `uv run ruff check .` (in `backend/`) | Lint the backend |

## Project structure

```
docs/               product plan and design notes
backend/            FastAPI service (app/, tests/, pyproject.toml)
src/app/            routes and layouts (App Router)
src/components/     feature components; ui/ for generic primitives
src/hooks/          client hooks
src/lib/            helpers and service clients
src/types/          shared domain types (Place, Experience, Bookmark, ...)
```

## Contributing

Conventions for humans and AI coding agents live in [AGENTS.md](AGENTS.md). Update the relevant files in `docs/` alongside every code, configuration, schema, or workflow change. Commit messages follow `<type>: <description>`, for example `feat: add bookmark toggle`.
