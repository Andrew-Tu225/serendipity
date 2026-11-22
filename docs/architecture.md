# Application architecture

Serendipity uses a Next.js frontend, a FastAPI backend, and PostgreSQL. Apply the same flow to authentication and future Place, Experience, Bookmark, and Friend features:

```text
UI component or hook
  → typed frontend API client
  → /api/* through the Next.js proxy
  → FastAPI router
  → service
  → repository
  → PostgreSQL
```

Responses travel back through those layers to the UI. FastAPI owns data validation, authentication, and business logic. Next.js renders the interface and proxies API traffic.

The app is mounted at `/`, with a shared client session gate before any personal UI or data requests. Signed-out visitors go to `/login`; authenticated accounts without `onboarding_completed_at` go to `/onboarding`; completed accounts reach Home. The gate rechecks on focus/visibility and clears the app on authentication failures or account changes. Session outages show a retry state. Account-gated pages opt out of Next.js instant-navigation validation because their segments are intentionally deferred until identity is verified. `/success` redirects to `/`. FastAPI continues to authorize protected APIs; existing public read APIs remain public.

## Layer responsibilities

| Layer | Location | Responsibility |
|---|---|---|
| UI | `src/app/`, `src/components/`, `src/hooks/` | Call domain API clients and render loading, success, and error states. |
| API client | `src/lib/api-client/` | Define typed domain methods; centralize HTTP requests, backend URLs, cookies, CSRF headers, cancellation, and error parsing. |
| Frontend types | `src/types/` | Describe the data returned to components. |
| API endpoints and schemas | `backend/app/api/`, `backend/app/schemas/` | Define HTTP endpoints and validate request/response shapes with Pydantic. |
| Service | `backend/app/services/` | Apply business rules and resource permissions, coordinate repositories and integrations, and commit or roll back transactions. |
| Repository | `backend/app/repositories/` | Read and write database records using an injected SQLAlchemy session. |
| Models and database | `backend/app/models/`, `backend/app/database.py` | Define persistence models and provide database sessions. |
| Integration | `backend/app/integrations/` | Communicate with external providers such as Auth0. |

Group modules by domain within each layer. For example, an auth client belongs beside other domain clients, while user database queries belong in the user repository.

UI components do not make ad hoc `fetch` calls or contain backend endpoint strings. Routers delegate application work to services. Database queries belong in repositories. Repositories do not commit transactions or create HTTP responses; the service controls the transaction so related writes succeed or fail together. Add schema changes through Alembic migrations in `backend/migrations/`.

## Discovery map and public place search

Discover loads the Maps JavaScript SDK only after the tab opens. Its client-side map adapter owns
the Google map, geographic markers, location indicator, camera operations, and listener cleanup.
React portals supply custom marker contents, including initials identifying followed users. Marker
instances are keyed by stable Place identity/coordinates and their contents update in place. The
discovery hook retains a viewer-scoped in-memory cache with buffered geographic coverage, delta
queries, incremental pagination, and quiet one-minute revalidation. Existing HTTP contracts and
no-store response headers remain unchanged; this cache is private to the mounted UI.
Discover occupies the full phone area above navigation, with search and previews layered over the
map. App-reviewed Places and friend snippets come from the discovery API; dense pins are clustered.
A separate `useRecommendations` hook requests 30 ranked Places per buffered bbox (25% beyond each
visible edge), with up to 8 full-area snapshots cached for one minute. Small pans reuse the active
snapshot and applicable pending request; crossing coverage requests a new area after 500 ms idle.
Focus/tab return retain fresh coverage; expiry refreshes the same area quietly. `mergeMapLayers` combines provider results,
review summaries, and recommendation metadata by app UUID/exact provider ID. Friend recommendations
are purple, personal recommendations amber, reviews white, and nearby unreviewed results grey. A
colour-preserving selection and marker tooltips expose those relationships; there is no legend. Followed-user reviews
alone remain white. Empty/failed rankings leave the independently loaded base layers available.
One clusterer owns all destination marker attachment, including nearby Google results. Every loaded
Place appears as an individual marker or contributes to a counted group. Selection temporarily leaves
clustering and remains visible; colour changes only update priority and never reveal hidden members.
The adapter measures visible icon/caption footprints after 150 ms of camera/marker-set quiet and
suppresses overlapping captions only, prioritizing selection, friends, personal recommendations,
reviews, then nearby Places. That pass never changes SDK marker attachment. All SDK markers use
`REQUIRED`; native collision handling cannot independently hide Places. The map canvas isolates
marker stacking below floating controls. Browsing readiness derives from the two base layers;
recommendations are a nonblocking metadata overlay. Identity comes from the shared session gate.
The tab remains mounted while hidden to preserve the map's camera and selected place; hiding it
cancels pending search/details/discovery requests and suspends refresh timers. Fresh discovery
coverage is reused on return, and session changes invalidate personalized cached data. Home, Buddy,
and Profile keep their existing behavior.

Place search follows `UI → placesClient → /api proxy → places router → PlacesService → GooglePlacesClient`.
The integration uses Google Places API **New**, separate from the browser Maps SDK. No repository,
database connection, tables, or commits are involved in this read-only provider flow.
Nearby discovery follows this same flow through `GET /api/places/nearby`, with validated coordinates
and a 50–5,000 m radius. The provider filters experience destinations and returns at most 20 places
per search. `useNearbyPlaces` reuses bounded geographic search cells in temporary display memory,
separately from the app's reviewed-place cache. Google IDs deduplicate results and let app Places
take precedence. Nearby markers use our custom category glyphs, with no Google ratings or reviews.
`useNearbyPlaces` is a lifecycle adapter around one `NearbyDiscovery` queue. Stable level-13 roots
are reused across zooms. Every visible root is queued; uncached root coverage precedes dense-area
refinement and stale refreshes. Only responses reaching 20 Places subdivide (up to level 16, when
zoom permits), retaining parent results. This replaces per-zoom grid invalidation and nine-cell sampling.
The queue owns three concurrent requests, an 18-attempt rolling-minute budget, per-cell one-minute
failure backoff, five-minute freshness, latest-response deduplication, and offscreen cache eviction.
Budget waits automatically resume; one failed cell cannot block healthy areas. More than 512 root
cells or zoom below 9 produces a zoom-in hint, not an unbounded scan. Base loading, budget pauses,
zoom limits and empty results are distinct states. Backend contracts and process limits are unchanged.
See [discovery-map.md](discovery-map.md) for sampling, freshness, density, and billing limits.

Discovery follows `UI → discoveryClient → discovery router → DiscoveryService → DiscoveryRepository
→ PostgreSQL`. It queries every app-reviewed Place within visible bounds, paginates results, and
returns latest-per-author ratings and viewer-specific followed-user snippets. Public browsing uses
an optional session dependency; invalid/expired sessions are anonymous while database failures remain
errors. Search results join to app Places only by an optional unique Google Place ID (migration 0003).
App IDs remain separate from provider identifiers. The base API includes every reviewed Place;
recommendation exclusions remove highlights without removing base review pins. The review form submits through the same typed
client with a CSRF token; `CurrentUser` and `VerifiedMutation` protect writes. The discovery service
creates an optional user-authored Place, then delegates to the existing Experience service to commit
the Place, Experience, and taste update together. Repositories never commit. Public reviews and
summaries use no-store headers, including on error. See [discovery-data.md](discovery-data.md).

`GET /api/places/autocomplete` validates the text, UUID session token, and optional paired coordinates.
`GET /api/places/{place_id}` validates the provider ID and session token. The service applies process-wide
sliding-window limits (120 autocomplete, 60 details, and 60 nearby calls/minute), normalizes provider data, and
sanitizes failures. The provider integration fixes the Google origin, encodes IDs, sets field masks,
and imposes a 10-second timeout. `429` responses include `Retry-After`; validation returns `422`;
unconfigured or failed provider requests return `503`. Every Places response, including errors, is
`Cache-Control: no-store`. These public, read-only routes do not require authentication or CSRF.

Google search and nearby results live only in mounted-UI memory. They are not persisted, stored in browser
storage, or cached by the backend. App Places persist user-authored names and user-chosen map
points, plus optional provider IDs. Google search names/addresses/coordinates are not copied into
app records. Hard-coded demo discovery pins are removed. No Google photos or reviews are fetched. Required map
attribution and returned provider attributions remain visible. See [discovery-map.md](discovery-map.md).

## Authentication flow

The user-creation entry point is `GET /api/auth/callback`. Its implementation follows this chain:

```text
backend/app/api/auth.py: callback()
  → backend/app/services/auth.py: AuthService.finish_login()
  → backend/app/repositories/users.py: UserRepository.upsert_from_auth0()
  → PostgreSQL users table
```

The repository creates the user on first login and updates the same account on later logins, matched by Auth0 `sub`. User creation happens only after the backend verifies the Auth0 response.

1. The login UI calls `authClient.startLogin()`. The client navigates the browser to `/api/auth/login`; full navigation lets FastAPI redirect to Auth0's hosted login.
2. FastAPI uses the Auth0 integration to start Authorization Code flow with PKCE. Temporary login state is stored through the session repository in Postgres.
3. Auth0 returns to `/api/auth/callback`. The backend consumes the one-use login state and validates the returned identity.
4. The auth service upserts the user through `UserRepository`, using the verified Auth0 `sub` as the identity link. It creates a fresh session through `SessionRepository` and commits before redirecting to `/`.
5. The shared session provider calls `authClient.getSession()`. `GET /api/auth/me` returns the current user row (including onboarding completion), verified claims snapshot, and a CSRF token. The UI does not display claims or the token.
6. Incomplete accounts choose categories at `/onboarding`. `PUT /api/me/onboarding` uses `CurrentUser` and `VerifiedMutation`; the onboarding service owns the atomic commit/rollback, and its repository locks the user while replacing interests and setting first completion. Auth0 profile updates preserve these fields.
7. Profile loads `GET /api/me/profile` for real counts and interests. Its sign-out button calls `authClient.signOut()`, revokes the session, and navigates to the Auth0 logout URL.

The browser authenticates API requests with an HttpOnly session cookie. Auth0 credentials stay in backend configuration, and raw Auth0 tokens are discarded after callback processing. Authenticated responses use `Cache-Control: no-store`; the UI does not render the CSRF token.

Future protected routes use `CurrentUser`. State-changing routes additionally use `VerifiedMutation` for CSRF and origin checks. Services must check resource ownership using the authenticated user; a user ID supplied by the browser is not proof of ownership.

## Recommendation flow

`GET /api/recommendations` and `GET /api/places/{place_id}/logs` follow the same layering:

```text
backend/app/api/recommendations.py        CurrentUser, bbox/limit validation, response mapping
  → backend/app/services/recommendations.py: RecommendationService
  → backend/app/repositories/recommendations.py: RecommendationRepository.load_input() / load_place_logs()
  → backend/app/recommend/                  pure algorithm (docs/recommendations.md section 2)
```

The service converts the signed-in ORM `User` into the domain `User`, loads the viewer's data through `SqlRecommendationRepository`, and passes it to the pure `recommend()` function. `backend/app/recommend/` never touches the database. Rows become domain models through `backend/app/models/conversions.py`. Both routes send `Cache-Control: no-store`.

The repository reads the `places`, `experiences`, `follows`, `bookmarks` and `taste_profiles` tables (migration `0002`). For one request it loads the places inside the bbox (at most `MAX_PLACES_IN_VIEW`), the latest Experience per `(user, place)` there, those logs' authors, the viewer's follows and bookmarks, and every taste profile row. Migration `0005` adds `user_interests`; the repository combines each stored category score with +1 for an explicitly selected interest before passing profiles to the pure recommender. Stored review scores remain unchanged. Both ranked results and Place log relations use these effective profiles.

### Creating a log

`ExperienceService.create_experience()` is the only write path for Experiences:

```text
backend/app/services/experiences.py: ExperienceService.create_experience()
  → backend/app/repositories/places.py: PlaceRepository.get()                 404 if missing
  → backend/app/repositories/experiences.py: ExperienceRepository.add()
  → backend/app/repositories/experiences.py: TasteProfileRepository.add_score()
  → one commit
```

The log and its taste-profile increment commit together or not at all. `add_score` is an `INSERT ... ON CONFLICT DO UPDATE SET score = score + excluded.score`, so concurrent logs by the same user cannot lose an update. `POST /api/discovery/experiences` calls it through `DiscoveryService`, using `CurrentUser` and `VerifiedMutation`; a new Place participates in that same transaction.

## Social interactions

Public profiles/search, Experience detail/likes/comments, directed follows, private bookmarks, and
the following feed use `social` modules in the API, schema, service, and repository layers. See
[social-api.md](social-api.md) for every endpoint and frontend integration contract. No UI or frontend
client changes accompany these APIs. Public personalized reads use `OptionalUser`; private saves
and the feed require `CurrentUser`. Every mutation also requires `VerifiedMutation`. Public identity
schemas exclude the diagnostic auth response's email and Auth0 fields. All social responses,
including errors, use no-store headers.

`SocialService` owns comment-author permissions and transaction commits/rollbacks. `SocialRepository`
owns queries, conflict-safe relation inserts, SQL pagination, and batched social counts/viewer flags.
Migration `0004` adds Experience likes, comments, and private Experience bookmarks; existing `follows`
and Place `bookmarks` are reused. Place saving can atomically create an unreviewed, user-authored
Place through the same repository path used by discovery review creation. Google IDs converge on
one Place without overwriting existing fields. Saved review and Place collections are independent.
Only Place bookmarks and follows affect existing recommendations; social likes/comments do not
alter taste profiles. Experiences stay immutable. The feed queries all published Experiences of
currently followed users, including repeat visits, ordered by publication time rather than visit date.

## Adding a feature

Local maintenance commands in `backend/scripts/` validate a loopback PostgreSQL target and delegate
to `DemoDataService` and `DemoDataRepository`. The service commits whole seed/reset operations;
the repository owns inserts/deletes. Stable demo IDs make seeding repeatable without double-counting
taste scores or overwriting existing rows. Reset deletes only mapped app rows, preserving the
migrated schema and Alembic version, and requires the database name as explicit CLI confirmation.
There are no maintenance HTTP endpoints. See [local-demo-data.md](local-demo-data.md).

Create and switch to a feature branch from the latest appropriate base before editing files. Keep each distinct change on its own branch and pull request; continue review fixes on the existing pull request branch.

1. Define its Pydantic API contracts and matching frontend types.
2. Add models and an Alembic migration if persistence changes, then implement the repository queries.
3. Add the service behavior, permissions, and transaction boundary, and expose it through a domain endpoint module in `backend/app/api/`, mounted under `/api`.
4. Add typed domain methods to the frontend API client and call them from the UI or feature hook.
5. Verify the behavior at the relevant layers and update the affected documentation in the same change. Keep this architecture note, product decisions, setup instructions, and environment examples aligned with the implementation.

After verification, commit with a descriptive conventional commit message, push the feature branch, and open a pull request. The pull request should explain the problem, resulting behavior, implementation choices, checks performed, and setup or migration requirements. Note material limitations or checks that could not be completed.


## First-login personalization and Profile

Onboarding uses the same 430px phone frame, desktop rounded corners/shadow, and status bar as the app. Interests scroll inside the frame while an explicit Continue button and sign-out action stay at its bottom; mobile screens fill the viewport without document overflow. Continue stays visible while disabled, with a hint to select at least one interest, then saves onboarding before entering Home. If a running local dev server serves stale CSS and clips these actions, restart it with a fresh `SERENDIPITY_DIST_DIR` before verifying layout.

`api/onboarding.py` → `OnboardingService` → `OnboardingRepository` owns `/api/me/profile` and `/api/me/onboarding`. Private profile responses expose a public user summary, interests, completion timestamp, and counts for Experiences, saved Places, and following. Requests never accept an owner ID. Category values match the domain enum; unknown/duplicate/empty interests are rejected. `users.onboarding_completed_at` starts null for existing users. Interests are unique by user/category and cascade when a user is removed.

Home retains the pre-consolidation layout, with category filters, the pottery card, social row,
and nearby card. The imported `HomeDiscoveryFeed` carousel is not mounted. The app shell, Discover
preview, and shared styles match commit `927ec90`; the map adapter, nearby queue, caching, and
recommendation overlays retain the latest fixes. Login and onboarding gate entry to the app.
Profile uses Auth0 name/avatar with an initials fallback and real database counts; mock scores,
activity, and character customization are removed. The unrelated Buddy prototype remains.

The Figma preview source (`src/app/App.tsx`, `main.tsx`, and `vite.config.ts`) remains separate from
the Next.js app entry. Its image imports accept both Vite URL strings and Next.js image metadata
so the shared repository compiles under Next.js as well as the Figma preview tooling.
