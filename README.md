# Serendipity

**Discover the world through the experiences of people you trust.**

Serendipity is a map-first social discovery app, like Letterboxd for real-world places. Your map is shaped by what friends and people with similar taste have visited and recommended, rather than by thousands of strangers' ratings.

Built at **Hack Western 13** for the theme **Discovering the Unknown**. The focus is not undiscovered places but places unknown *to you*: the café two streets over, or the trail a friend loves.

**Core loop:** Discover → Save → Experience → Review → Share → someone else discovers.

## Features

- **Discovery map:** an interactive Google map of London, Ontario. Pin colours show each place's relationship to you: nearby places, community reviews, personal recommendations, and friends' picks.
- **Experiences:** log a visit to any place (restaurant, trail, gym, museum, viewpoint) with a rating, verdict (recommend, okay, avoid), date, and written review.
- **Explainable recommendations:** every recommended place is backed by a real review from someone you follow or someone with similar taste, and the pin shows who and why. Some slots are reserved for hidden gems outside your circle.
- **Taste profile:** first-login onboarding asks for the place categories you love. Every review then refines a per-category taste score.
- **Taste Buddies:** swipe through people with similar taste and message them from a private inbox.
- **Profile and social:** character avatars, followers and following, saved place lists, and your recent experiences.

## How recommendations work

1. **Log value:** each review becomes a score from −1 to +1. Recommend is +1, avoid is −1, and a neutral verdict is scaled from the star rating.
2. **Taste profile:** a user's log values are summed per category. Onboarding interests give a small initial boost.
3. **Similar users:** taste profiles are compared with cosine similarity, and the closest users you don't already follow become your similar-taste circle.
4. **Trust:** people you follow have trust 1. Similar users are weighted by how closely their taste matches yours, and everyone else has trust 0.
5. **Place score:** for places in view that you haven't logged or saved, the score is the sum of trust × log value. Only places with a positive score are recommended.
6. **Fill:** about 80% of slots go to the top-scoring places and the rest to hidden gems. The selection is seeded per user per day, so it stays stable within a day.

Full schema, formulas, and API: [docs/recommendations.md](docs/recommendations.md).

## Architecture

See [docs/architecture.md](docs/architecture.md).

## Getting started

Requires Node.js 20.9+, Python 3.11+, [uv](https://docs.astral.sh/uv/), and Docker.

```bash
cp backend/.env.example backend/.env    # Auth0 + Google server key + database
cp .env.example .env.local              # Google Maps browser key + Map ID
npm install

docker compose --env-file backend/.env up -d db
cd backend && uv sync && uv run alembic upgrade head && cd ..
npm run db:seed                          # optional: London demo users, places, reviews
```

Run both servers:

```bash
cd backend && uv run fastapi dev app/main.py   # http://127.0.0.1:8000 (docs at /api/docs)
npm run dev                                    # http://localhost:3000
```

**Configuration:**
- **Auth0:** create a Regular Web Application.
  - Callback URL: `http://localhost:3000/api/auth/callback`
  - Logout URL: `http://localhost:3000/login`
  - In `backend/.env`, set `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, and `AUTH0_CLIENT_SECRET`.
- **Google:** enable Maps JavaScript API and Places API (New).
  - In `.env.local`, set the browser key `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` and `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`.
  - In `backend/.env`, set the server key `BACKEND_API_KEY_GOOGLE`.
  - Map setup and styling: [docs/discovery-map.md](docs/discovery-map.md).

Every variable is documented in the matching `.env.example`. Database, Auth0, deployment, and test details: [docs/setup.md](docs/setup.md).

## Tests

```bash
npm run lint && npm run build && npm run test:browser
cd backend && uv run pytest && uv run ruff check . && uv run ruff format --check .
```

## Project structure

```
src/app/          routes and layouts (App Router)
src/components/   feature components (map, experience, profile, buddy, ...)
src/lib/          typed API clients and map helpers
backend/app/      FastAPI: api/, services/, repositories/, models/, schemas/, integrations/
backend/tests/    pytest suite
docs/             product plan and design docs
```

## Documentation

| Doc | Covers |
|---|---|
| [plan.md](docs/plan.md) | Product concept, user story, open questions |
| [architecture.md](docs/architecture.md) | Layers, request flow, auth, adding features |
| [recommendations.md](docs/recommendations.md) | Recommendation schema, algorithm, API |
| [discovery-map.md](docs/discovery-map.md) / [discovery-data.md](docs/discovery-data.md) | Map setup, pin layers, data loading |
| [social-api.md](docs/social-api.md) | Follows, likes, comments, saves, feed |
| [setup.md](docs/setup.md) | Database, Auth0, deployment, and test configuration |
| [local-demo-data.md](docs/local-demo-data.md) | Seeding and clearing local data |

Contributor and AI-agent conventions are in [AGENTS.md](AGENTS.md).
