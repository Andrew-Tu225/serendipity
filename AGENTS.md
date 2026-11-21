<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Serendipity

A map-first social discovery app for a hackathon (theme: "Discovering the Unknown"). Users log experiences at real-world places (rating, review, photos), bookmark places to visit later, and explore a map shaped by what their friends have reviewed and recommended, rather than by stranger ratings. Think Letterboxd for places, built around an interactive map.

Full product concept and open questions: [docs/plan.md](docs/plan.md). Read it before making product or data-model decisions.

## Core loop

Discover → Save → Experience → Review → Share → someone else discovers.

Every feature should serve that loop. The map is the primary surface; a feed or list view is secondary.

## Domain vocabulary

Use these names consistently in code, routes, and the database.

| Term | Meaning |
|------|---------|
| Place | A real-world location on the map: restaurant, trail, gym, museum, viewpoint, anything. Not limited to businesses. |
| Experience | One user's log of a visit to a Place: rating, written review, photos, recommend/avoid. |
| Bookmark | A user saving a Place to visit later, whether or not they have been there. |
| Friend | A social connection whose Experiences shape the user's map. Mutual vs. follow is undecided (see plan §8). |

Map markers distinguish a Place's relationship to the viewer: recommended by friends, reviewed by friends, bookmarked by the viewer, or a possible hidden gem.

## Stack

- **Frontend:** Next.js 16 (App Router, Turbopack), React 19, TypeScript (strict)
- Tailwind CSS v4 (configured in `src/app/globals.css`, no `tailwind.config`)
- ESLint 9 via `eslint-config-next`
- **Backend:** Python 3.11+ FastAPI in `backend/`, managed with `uv`; Pydantic for request/response models, pytest and ruff for tests and lint. All API routes live under `/api`; Next.js proxies `/api/*` to it (`API_URL`, see `next.config.ts`), so do not add Next.js route handlers or Server Actions for data — business logic and validation belong in FastAPI.
- **Database:** PostgreSQL 17, local Docker Compose, SQLAlchemy with Psycopg, and Alembic migrations.
- **Auth:** Auth0 Regular Web Application. FastAPI owns OAuth callbacks and opaque database-backed sessions; the browser uses an HttpOnly cookie.
- Not chosen yet: map library and image storage. Do not add one without confirming with the team.

## Layout

```
docs/               product plan and design notes
backend/app/        FastAPI app: main.py, config.py, api/ (endpoint modules per domain)
backend/tests/      pytest suite
src/app/            routes and layouts (App Router)
src/components/     feature components; src/components/ui/ for generic primitives
src/hooks/          client hooks (use* prefix)
src/lib/            framework-agnostic helpers and service clients
src/types/          shared domain types (Place, Experience, Bookmark, ...)
```

Group feature code by domain (`components/map/`, `components/experience/`) rather than by file type. Import from `src` via the `@/` alias.

## Commands

```bash
# frontend (repo root)
npm run dev     # http://localhost:3000
npm run build   # production build; must pass before merging
npm run lint

# backend (cd backend)
uv sync                                   # install deps into backend/.venv
uv run fastapi dev app/main.py            # http://127.0.0.1:8000, docs at /api/docs
uv run pytest
uv run ruff check . && uv run ruff format --check .
```

Run both dev servers during development; the frontend reaches the backend through `/api/*`.

## Conventions

### Branch, commit, and pull request workflow

- Always create and switch to a new feature branch before changing files. Start each change from the latest appropriate base branch; do not implement or commit directly on `main`.
- Follow this order for each change: create a branch → implement the change and update documentation → run the relevant checks → commit → push the branch → open a pull request.
- Use a separate branch and pull request for each distinct change. Follow-up fixes for an open pull request belong on that pull request's branch.
- Write descriptive commit messages using `<type>: <description>`. Explain the concrete behavior changed; add a commit body when context or implementation details help reviewers.
- Give each pull request a descriptive title and explain the problem, resulting behavior, key implementation choices, validation performed, and any setup or migration steps. Report material limitations and checks that could not be completed.

### Application architecture

Use this dependency direction for every feature:

`UI → frontend API client → FastAPI router → service → repository → PostgreSQL`

Read [docs/architecture.md](docs/architecture.md) for layer responsibilities, request flow, and the process for adding features.

- UI components call typed domain clients in `src/lib/api-client/`; keep `fetch`, backend endpoint strings, cookie options, CSRF headers, and error parsing inside that layer. Auth redirects are full browser navigations initiated by the auth client.
- FastAPI routers handle HTTP and Pydantic request/response validation. Services own business rules, authorization, orchestration, and transaction commits. Repositories receive an injected SQLAlchemy session and own database queries; they do not commit transactions or return HTTP responses.
- Backend endpoints live in `backend/app/api/`. Other backend modules live in `schemas/`, `services/`, `repositories/`, `models/`, and `integrations/`, grouped into domain modules within each. External providers such as Auth0 belong in integrations, not repositories.
- Protected routes use the shared `CurrentUser` dependency. State-changing routes additionally use `VerifiedMutation` for CSRF/origin validation and enforce resource ownership in the service. Never trust a client-supplied owner ID.
- Keep Auth0 tokens and credentials on the backend. Store only verified ID-token claims for the diagnostic page; never return raw tokens, database session hashes, or OAuth state/verifiers.
- Apply schema changes with Alembic. Do not create application tables automatically at startup. Authenticated responses must not be shared or cached.

### Documentation maintenance

- After every code, configuration, database schema, or workflow change, update the relevant documentation in `docs/` in the same change. Documentation updates are part of completing the task.
- Keep [docs/architecture.md](docs/architecture.md) aligned with the implemented layer boundaries, request flow, and authentication behavior. Update product decisions in [docs/plan.md](docs/plan.md) when those decisions change.
- Update README setup instructions and the matching `.env.example` whenever commands, dependencies, or configuration change. Document variable names and purpose without including secrets.

### General conventions

- Server Components by default; add `"use client"` only for interactivity (the map, forms, bookmark toggles).
- Frontend secrets go in `.env.local`, backend secrets in `backend/.env` (both git-ignored). Document every variable in the matching `.env.example`. Only `NEXT_PUBLIC_*` values reach the browser; map tile keys may be public, database keys must not be.
- Validate user input (reviews, ratings, uploads, coordinates) in FastAPI with Pydantic models; the frontend validation is for UX only.
- Commit messages: `<type>: <description>` with types feat, fix, refactor, docs, test, chore, perf, ci.
- Hackathon scope: ship the core loop end to end before polishing any single feature. Prefer seeded demo data (e.g. Toronto places and a few fake friends) over building features the demo will not show.
