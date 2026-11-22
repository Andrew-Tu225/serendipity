# App-reviewed places on the map

Discover combines the original map results with a recommendation overlay. Reviewed Places come from
`/api/discovery/places`; temporary nearby destinations come from Google through FastAPI. The signed-in
`/api/recommendations` response adds personalized and friend-recommended highlights independently.
An empty or failed recommendation request leaves the base results available.

## Marker colours and precedence

| Colour | Meaning | Source |
|---|---|---|
| Neutral grey, smaller pin | Nearby place without an app review | Google Nearby Search |
| Blue | Reviewed Place, including self-reviewed/bookmarked Places and followed-user reviews | Discovery API |
| Amber | Personalized recommendation (`similar_taste` or `explore`) | Recommendations API |
| Purple | Friends' recommendation (`friend`) | Recommendations API |

A compact Places / Reviews / For you / Friends legend explains these colours. Selection preserves
the marker's layer colour. A followed user's review alone stays blue; purple requires the API's
friend recommendation classification. App UUIDs deduplicate reviewed and recommended results;
exact Google IDs suppress duplicate provider pins. Recommendation metadata overlays the app's
existing aggregate rating/identity. Each Place has one marker, with friend recommendation first,
then personalized recommendation, then base review, then an unreviewed provider result.

Ranked results request up to 30 Places per exact visible bbox after a 250 ms idle debounce. Date-line
views use two ordinary bboxes and deduplicate IDs. Up to eight exact-view snapshots stay fresh for
one minute. Full rankings replace recommendation membership, while base review coverage remains
independent. A Place leaving recommendations returns to its blue review marker rather than
vanishing. Supporting logs and relations remain visible in the selected preview; an aggregate
rating is shown when available, otherwise the supporting log rating is labelled as such.

## Browsing

Discover starts in London, Ontario. It keeps an in-memory cache of app Places by internal UUID and
of fully fetched geographic rectangles. The initial request extends 25% beyond each visible edge.
Panning or zooming within fresh coverage makes no data request; moving beyond it subtracts cached
coverage and requests only the exposed rectangles, using the existing bbox API. Date-line views
remain split into ordinary rectangles, and latitude/longitude buffers stay within geographic limits.
Map idle events are debounced by 250 ms. Returning to a freshly loaded area reuses cached data.

Coverage stays fresh for 60 seconds. Stale visible coverage refreshes quietly while the map is active
and when the window/tab regains focus. No loading banner appears after the first successful area
load. Existing pins remain visible during background requests and errors; retry is available. An
empty-area message requires complete coverage of the visible viewport and zero Places inside it,
so cached offscreen results do not hide an empty state or cause one during an unfinished fetch.

The API returns pages of 200 Places by default (maximum 500), ordered by internal UUID. Each page
merges into the current Place cache immediately. A region becomes complete only after its final
page succeeds. Failed/aborted pagination cannot claim coverage or remove previous data. A complete
refresh removes records no longer returned for that rectangle, while superseded responses cannot
replace current data. In-flight requests covering the view are reused; obsolete work is cancelled
when navigating elsewhere or hiding the tab. Browser-hidden pages suspend refresh timers and work.

Marker creation depends on stable identity and coordinates, rather than each response object.
Unchanged Place objects are reused, marker components are memoized, and changed ratings/friend
labels update their React portal contents. Click handlers read the latest Place. SDK marker objects
are recreated only when identity, coordinates, or map change; title changes update in place. App and
selected markers share one keyed list, so a selected pin stays alive when it moves between the
visible results and selection fallback. The existing clusterer receives incremental membership
changes batched into an animation frame. Selection updates are idempotent. Google destination
markers join the clusterer; the device location dot remains separate. Selected markers are pinned
outside clusters. App Places override Google markers with the same linked provider ID.

The cache targets 32 completed regions and 5,000 Place records, evicting least-recently-used offscreen
coverage/data first. Active-area results are protected even if they exceed these soft budgets; no
reviewed Places in the current area are dropped to meet a cache cap. Evicting records also invalidates
their coverage so returning later cannot incorrectly treat missing data as complete. Markers outside
the buffered area are released; the selected marker remains pinned. Cache state lasts only for the
mounted map, including navigation between app tabs, and is reset by page reload.

Session identity is checked on entering Discover, window/tab return, and freshness revalidation.
The shared app gate now removes the map on account changes or expiry: an account change mounts a fresh app, and expiry redirects to login. Session-service failures show a retry screen. Map-local identity revalidation still clears personalized coverage before refreshing. No cache is shared between browser sessions or persisted to localStorage, and all HTTP no-store headers remain in place.

After a successful review submission, its returned Place merges immediately and invalidates the
coverage containing that point. Other cached areas remain available; background revalidation then
reconciles that area's data. The selected marker and open preview are preserved while its rating
updates. No backend API, schema, provider cache, or dependency changes are needed for this behavior.

One user's latest Experience per Place contributes to the rating average and reviewer count, using
`visited_on`, then `created_at`, then UUID as descending tie breakers, consistently with recommendations.
The average can have more precision than the individual 0.5-step ratings; the UI displays one decimal.
Friend counts and snippets include the latest Experience from users the viewer follows, even when
their verdict is neutral or avoid. The backend discovery API retains anonymous public ratings and reviews without friend/self labels.
The app itself requires sign-in and completed onboarding; session expiration redirects to login.
Database failures remain errors. Every discovery response, including errors, is `Cache-Control: no-store`.

Selecting an app marker fetches its public reviews in pages of 20. Reviews show author name, rating,
verdict or written text, and visit date; signed-in viewers also see Friend/You labels. Blank areas show
an empty state with a review action. Database failures offer retry and never insert demo pins. During
a refresh, previously loaded pins within the buffered area remain visible while updates arrive.

## Writing an Experience

Use **Write a review** on an existing marker to review that app Place. The **Add** navigation button
opens Discover in location-picking mode. Tap the map or use its center, then enter a Place name,
category, date visited, one overall rating, optional review, and recommend/neutral/avoid verdict.
The new Place name is user-authored and its coordinates come from the user's chosen map point.
The form requires sign-in before submission. Its fields survive save errors; it disables duplicate
clicks and closing during a pending save. Success is shown only after the API confirms the write,
then the selected card and viewport ratings refresh. A new reviewed Place therefore appears in the base review layer and remains available after reload.
The ranking is also invalidated: the API excludes the viewer’s logged/bookmarked Places from
recommendations, so these remain blue rather than being forced into a recommendation highlight. No photo/video storage provider is introduced.
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
opens the existing app Place and removes the temporary Google marker; names are not used to match.
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
UI remains future work. Saving an unreviewed Place does not make it eligible for reviewed-place
discovery until it has an Experience.
For opt-in local fixtures, `npm run db:seed` inserts London Places and labeled mock reviews. A separate
guarded reset command clears application rows; see [local-demo-data.md](local-demo-data.md).

Run frontend lint, TypeScript/production build, and the browser suite. Browser tests mock the external
Google SDK and backend HTTP contracts, exercising pagination, cancellation, date-line bounds,
clustering, layer colours and precedence, partial recommendation failures, search identity, login gating,
and successful/failed review submission. Backend tests
exercise real repositories and services with SQLite; set `TEST_DATABASE_URL` to run isolated PostgreSQL
migration and concurrent-insert tests. Provider billing, Cloud Console styling, and live OAuth still
require their separately configured smoke tests.
