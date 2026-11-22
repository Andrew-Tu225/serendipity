# Recommendation-driven discovery map

Google supplies the background map and explicit place search. Normal browsing pins come exclusively
from `GET /api/recommendations`, through
`UI → recommendationsClient → recommendation router → RecommendationService → SqlRecommendationRepository → PostgreSQL`.
The UI does not query the all-reviewed-Places list or automatically populate Google nearby results.
An empty or failed recommendation response never falls back to either source.

## Browsing

Discover starts in London, Ontario and requires a signed-in, onboarded account. It requests up to
30 recommendations for the exact visible bbox on first load, panning, zooming, search, or geolocation.
Map idle events are debounced by 250 ms. Date-line views make two ordinary bbox requests and merge
by internal Place ID. Limited rankings cannot be assembled from cached coverage strips: each
successful result replaces the previous normal pin set for that viewport, including selected pins
that are no longer returned. Selecting a Place may keep its detail preview open without keeping
it as an ordinary map pin.

Up to eight exact viewport snapshots are cached in mounted-map memory for 60 seconds. Repeat views
reuse fresh snapshots; expiry refreshes quietly. Overlapping unchanged marker identities retain
SDK instances. In-flight obsolete results are cancelled and ignored. Hiding the tab/browser cancels
work; returning to the window refreshes recommendations. The shared session gate clears the app
on expiry or account changes. No recommendation cache is persisted or shared between users.

Pins and previews identify friend, similar-taste, and explore recommendations, and show the returned
positive review evidence. A pin's rating is its supporting review's rating, never an invented
all-user average or reviewer count. Opening the detail panel may load paginated public reviews
through the existing discovery details endpoint; this does not add other database Places to the map.
Empty results show “No recommendations in this area yet.” Failures offer retry while retaining
previously returned API pins still within the current view.

After a successful review, viewport recommendation snapshots are invalidated and fetched again.
Reviewed or bookmarked Places are excluded by the recommendation algorithm, so a Place may disappear
from normal pins after the viewer logs it. The returned review Place is not automatically inserted
into the recommendation set. The write confirmation and detail preview remain available.

## Writing an Experience

Use **Write a review** on an existing marker to review that app Place. The **Add** navigation button
opens Discover in location-picking mode. Tap the map or use its center, then enter a Place name,
category, date visited, one overall rating, optional review, and recommend/neutral/avoid verdict.
The new Place name is user-authored and its coordinates come from the user's chosen map point.
The form requires sign-in before submission. Its fields survive save errors; it disables duplicate
clicks and closing during a pending save. Success is shown only after the API confirms the write,
then the selected detail card updates and recommendations are fetched again. The logged Experience
persists, while the viewer’s just-reviewed Place is excluded from their ranked recommendations. No photo/video storage provider is introduced.
After Auth0 sign-in, incomplete accounts choose category interests at `/onboarding`; completed accounts reach Home. Home recommendation cards open real discovery details and focus the map without resetting the camera when switching tabs.

`CurrentUser` supplies the author. `VerifiedMutation` enforces CSRF and origin checking. Pydantic
rejects unknown fields such as a forged owner, invalid ratings, future visits, blank/long names,
invalid coordinates, and reviews over 2,000 characters. Exactly one of `place_id` or `new_place` is
required. The existing Experience service commits the new Place (if needed), Experience, and atomic
taste-profile increment together; a failed write rolls all three back. Repeat visits remain separate
logs, while only the latest counts toward the map summary.

## Place identity and Google search

An app Place has an internal UUID and optionally a unique `google_place_id`. Selecting a Google
search result keeps its provider data transient and attempts an exact provider-ID lookup. A match
opens the existing app Place using one temporary selection marker; names are not used to match.
This explicitly searched marker may be outside recommendations and is removed on closing the preview.
An unknown result remains searchable with no invented ratings. Writing its first review asks for
a user-authored Place name and a chosen map point, retaining only the provider ID for future matches.
Concurrent submissions for one Google Place ID converge on one app Place without overwriting its
existing user-authored fields. Unlinked Places can be reviewed directly; automatic merging by name
or proximity is not implemented.

Migration `0003_google_place_identity.py` adds the nullable unique identifier to the existing `places`
table from migration `0002`. Google names, addresses, reviews, photos, and search coordinates are not
copied into durable app records. Keep the provider's attribution and storage requirements described
in [discovery-map.md](discovery-map.md).

## API

| Endpoint | Behavior |
|---|---|
| `GET /api/discovery/places?bbox=west,south,east,north&cursor=UUID&limit=200` | Public, optionally personalized; Places with at least one Experience. Returns `places` and nullable `next_cursor`. Bounds are inclusive and must be finite, ordered geographic coordinates. |
| `GET /api/discovery/places/by-google-id/{id}` | Exact provider-ID match, or 404. |
| `GET /api/discovery/places/{uuid}?offset=0&limit=20` | Place summary and latest-per-author reviews, newest visits first; nullable `next_offset`. Maximum page size 100. |
| `POST /api/discovery/experiences` | Authenticated, CSRF-protected; returns 201 and the refreshed Place/reviews. |

Place summaries contain internal ID, user-authored name, coordinates, category, optional provider ID,
rating average/count, friend count, and up to three friend review snippets. No identity-provider tokens,
emails, session hashes, or CSRF secrets are returned in public responses.

Creation example for an existing Place:

```json
{
  "place_id": "00000000-0000-0000-0000-000000000001",
  "rating": 4.5,
  "verdict": "recommend",
  "review": "Go early for a quiet lunch.",
  "visited_on": "2026-10-01"
}
```

For a new Place replace `place_id` with `new_place` containing `name`, `latitude`, `longitude`,
`category`, and optionally `google_place_id`. The server derives the author from the cookie.

## Setup and verification

Run `npm install`, then `cd backend && uv run alembic upgrade head`. There are no new environment
variables. Run both servers using the README commands. Database tables are never created at app
startup, and development fixtures are never inserted automatically. An empty database stays empty
until users author Places through Experiences or saved-place creation. Friend highlighting uses
`follows` records, now manageable through the [social backend API](social-api.md); friend-management
UI remains future work. Recommendations always require positive Experience evidence and exclude
the viewer’s logged or bookmarked Places.
For opt-in local fixtures, `npm run db:seed` inserts London Places and labeled mock reviews. A separate
guarded reset command clears application rows; see [local-demo-data.md](local-demo-data.md).

Run frontend lint, TypeScript/production build, and the browser suite. Browser tests mock the external
Google SDK and backend HTTP contracts, exercising recommendation-only pin membership, cancellation, date-line bounds,
clustering, search identity, login gating, and successful/failed review submission. Backend tests
exercise real repositories and services with SQLite; set `TEST_DATABASE_URL` to run isolated PostgreSQL
migration and concurrent-insert tests. Provider billing, Cloud Console styling, and live OAuth still
require their separately configured smoke tests.
