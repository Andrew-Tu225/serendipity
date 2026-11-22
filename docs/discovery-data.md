# App-reviewed places on the map

Google supplies the background map and location search. The browsing markers come from PostgreSQL,
through `UI → discoveryClient → FastAPI router → DiscoveryService → DiscoveryRepository → PostgreSQL`.
The discovery layer includes every reviewed Place within the visible area, across the existing category
taxonomy. Neutral, low-rated, self-reviewed, and bookmarked Places remain eligible. Recommendation
ranking and its positive-log requirements are a separate API and remain unchanged.

## Browsing

Discover starts in Toronto and requests the visible geographic rectangle after the Google map becomes
idle. Initial load, search navigation, panning, zooming, and device-location recentering all use the same
path. A 250 ms debounce avoids issuing requests continuously while moving the camera. Date-line
viewports are split into two ordinary rectangles. Requests are cancelled on newer map movement and
when the tab is hidden; stale results cannot replace a newer area's data. Returning to Discover
preserves the camera and selection and refetches the area.

The API returns pages of 200 Places by default (maximum 500), ordered by internal UUID. The client
loads every page and deduplicates by Place ID before replacing the marker set. Results are not limited
to the recommendation API's top picks. `@googlemaps/markerclusterer` groups dense pins; a cluster's
count represents its underlying Places and clicking it fits that area. Zooming in reveals individual
pins. A selected app Place remains visible while its preview is open. Search-only Google markers and
the device location dot are not part of app-place clusters.

One user's latest Experience per Place contributes to the rating average and reviewer count, using
`visited_on`, then `created_at`, then UUID as descending tie breakers, consistently with recommendations.
The average can have more precision than the individual 0.5-step ratings; the UI displays one decimal.
Friend counts and snippets include the latest Experience from users the viewer follows, even when
their verdict is neutral or avoid. Signed-out and expired-session visitors see public ratings and
reviews without friend/self labels. Only session-authentication 401s become anonymous; database
failures remain errors. Every discovery response, including errors, is `Cache-Control: no-store`.

Selecting an app marker fetches its public reviews in pages of 20. Reviews show author name, rating,
verdict or written text, and visit date; signed-in viewers also see Friend/You labels. Blank areas show
an empty state with a review action. Database failures offer retry and never insert demo pins. During
a refresh, previously loaded geographic pins may remain visible until the replacement arrives.

## Writing an Experience

Use **Write a review** on an existing marker to review that app Place. The **Add** navigation button
opens Discover in location-picking mode. Tap the map or use its center, then enter a Place name,
category, date visited, one overall rating, optional review, and recommend/neutral/avoid verdict.
The new Place name is user-authored and its coordinates come from the user's chosen map point.
The form requires sign-in before submission. Its fields survive save errors; it disables duplicate
clicks and closing during a pending save. Success is shown only after the API confirms the write,
then the selected card and viewport ratings refresh. A new reviewed Place therefore appears on the
next query and remains available after reload. No photo/video storage provider is introduced.
After Auth0 sign-in, the diagnostic success page includes an Explore places link back to the app.

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
until users log Experiences. Friend highlighting uses existing `follows` records; a friend-management
interface is outside this change.

Run frontend lint, TypeScript/production build, and the browser suite. Browser tests mock the external
Google SDK and backend HTTP contracts, exercising pagination, cancellation, date-line bounds,
clustering, search identity, public browsing, and successful/failed review submission. Backend tests
exercise real repositories and services with SQLite; set `TEST_DATABASE_URL` to run isolated PostgreSQL
migration and concurrent-insert tests. Provider billing, Cloud Console styling, and live OAuth still
require their separately configured smoke tests.
