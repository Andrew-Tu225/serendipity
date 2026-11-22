# Discovery map

Discover is a live Google map with custom markers and place search. The tab loads the SDK on first
use and begins at London, Ontario (42.9849, -81.2453), zoom 13. Browsing pins combine app-reviewed Places
in PostgreSQL with temporary Google Nearby Search results. All use our custom marker design: smaller,
neutral category pins for Google places, ratings and friend highlights for app Places. Dense pins cluster. Existing pins persist
across viewport updates; nearby areas are prefetched and newly exposed rectangles load in the
background. There are no
hard-coded demo pins or demo fallback on errors. Selecting a marker checks/opens its app reviews; closing
the preview keeps the marker available. See [discovery-data.md](discovery-data.md) for database
queries, review submission, public API access, and exact Google-ID matching. The app requires sign-in and completed category onboarding before browsing.

Discover fills the phone frame above navigation. The simulated status bar and page header are hidden.
Search floats at the top with safe-area spacing, with a crosshair location button to its right, and
place previews clear the raised Add button and Google's attribution. The desktop phone frame stays.
Previews and search suggestions scroll internally when needed. Selecting a Google result fits its
viewport or centers at zoom 16. Unknown Google Places remain temporary markers, displaying
provider name/address/link and returned attributions without invented app activity.
The ratings/friends legend is removed. Optional Google controls, including zoom buttons and keyboard
shortcuts, are disabled; touch gestures and the custom location button remain available. Google's
required logo, map attribution, and legal notices remain visible along the bottom edge.
The search and location controls share one two-column row: search uses the remaining width and the
location button reserves 48 px, with a 10 px gap. The location button has a 48 px touch target and a "Use my current location" tooltip. It is disabled
while the map is loading or a location request is pending; location is still requested only on tap.

Search waits for two trimmed characters and a 300 ms pause, then requests up to five suggestions,
biased toward a 25 km circle around the current map center. Searches remain global. The dropdown
supports arrows, Enter, Escape, and pointer selection. Clearing the input resets the session token;
it leaves the selected place and map position intact. A UUID groups suggestions and the selected
details request into a Google autocomplete session, then is discarded. Superseded requests are
aborted and stale responses ignored. Provider billing still follows Google's requested-field SKUs.

## Nearby places without app reviews

`GET /api/places/nearby?latitude=…&longitude=…&radius=…` calls Places API (New) Nearby Search
through the existing typed client, router, service, and provider integration. No database access or
schema migration is involved. The server limits the radius to 50–5,000 m and requests at most 20
distance-ranked results, including food/drink, parks/trails, culture, activities, and selected shops.
Utilities, offices, and residential addresses are not requested. The field mask excludes Google
ratings, reviews, and photos. Names, coordinates, categories, links, and attributions support display.

After a 500 ms map-idle pause, the UI searches newly encountered geographic cells. Map zooms 13–14
use level-13 cells, zoom 15 uses level 14, zoom 16 uses level 15, and zoom 17+ uses level 16. Around
Toronto these are approximately 3.5 km, 1.8 km, 900 m, and 450 m across. Search keys include the level,
so a coarse area's 20 results never claim that finer detail has been fetched. Up to nine visible
cells are eligible; views exceeding that budget fall back to coarser levels, down to level 13.
Larger views show app-reviewed Places and invite zooming in when empty. Each cell uses a circle
enclosing it, so overlapping results are expected and deduplicated
by Google Place ID. This is a sample of destinations, not an exhaustive listing of all Google places.
Results merge incrementally; unchanged markers retain their SDK objects. App Places with matching
Google IDs take precedence. Names or coordinate proximity never establish identity.
Overlapping cached cells resolve each Google ID using the most recently completed response, even
when the cells were inserted in a different order. Unchanged place objects are reused. Updated
labels and open nearby-place previews read current data without recreating an existing marker
at unchanged coordinates. Offscreen search cells are evicted before current-view cells when the
48-cell memory budget is reached. Changing search resolution does not clear coarser cached pins
while finer results are in flight; selected places remain pinned even outside loaded coverage.
Up to three nearby requests run concurrently, prioritizing cells closest to the map center. Each
cell is requested once per batch, and small pans still reuse fresh results. Concurrency changes
when existing calls run, not how many cells are searched. Results appear as individual requests
finish; a failed search stops queued work while already-running successful requests can still add
places. Obsolete queued areas are skipped, and hiding the map cancels the entire request group.
Zoom refinement can add paid searches. Each mounted map is capped at 18 attempted nearby requests
per rolling minute, including failed/aborted attempts. This budget survives tab changes and manual
retry, and remaining searches resume automatically as slots reopen. Previously loaded pins stay
available while waiting. The backend's separate 60/minute per-process limit still applies across
visitors; the client budget is not a shared/global billing cap.

Search cells are reused for five minutes in mounted-map memory (up to 48 cells / 960 provider rows).
Expired results refresh without first clearing visible pins; stale results may remain for up to 15
minutes if refreshing fails. No provider content is persisted, put in browser storage, shared with
other users, or written into the app-data cache. Hiding Discover or the browser cancels pending
requests; work resumes on return. Failures preserve reviewed pins and offer retry; background retries
back off for a minute. Explicit retry runs immediately. Larger-scale deployment needs shared quotas.

Selecting a Google marker checks the database by its Google ID before showing an empty-review
message. A database failure is shown as an error rather than "no reviews". Existing app records open
their real reviews; unknown places use the existing first-review flow with a user-authored name and
chosen map point. Required Google attribution remains visible; provider attribution appears in cards.
Nearby Search is billed separately from map loads and autocomplete. Configure Google quotas/alerts
before public use; small-pan reuse reduces calls but does not eliminate paid searches.

The location button uses browser geolocation on tap, with a 10-second timeout. Success shows a blue
location indicator and centers at zoom 15; denial leaves search and the camera usable. Switching
tabs preserves camera and selection, cancels pending search, and does not request location again.
Reloading resets camera memory; app Places and Experiences remain in the database. Saving, uploads,
and category filters are deferred. The development badge is disabled so it does not cover search
or navigation; compile and runtime errors still surface.

## Google configuration

1. In a billing-enabled Google Cloud project, enable **Maps JavaScript API** and **Places API (New)**.
2. Create a browser key restricted to Maps JavaScript API. Allow the website referrers used in
   development, such as `http://localhost:3000/*` and `http://127.0.0.1:3000/*`, and your production
   HTTPS website. Add other ports explicitly when testing there.
3. Set `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` in root `.env.local`.
4. Create a JavaScript **vector Map ID**. Create a cloud map style using **Import JSON**, paste
   [google-map-style.json](google-map-style.json), and convert/import the legacy JSON style in the
   editor. Publish it and associate it with the Map ID. It uses lavender land, muted blue water,
   green parks, light roads, and hidden POI labels. Configure both light/dark appearances consistently
   if enabling automatic map color schemes.
5. Set `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`. Without it, development uses `DEMO_MAP_ID` with Google's
   default map appearance. Production displays a configuration error until a Map ID is supplied.
6. Create a backend key restricted to Places API (New), with server egress IP restrictions where
   available. Set `BACKEND_API_KEY_GOOGLE` in `backend/.env`, never in a public frontend variable.
   Use the same Cloud project for autocomplete and details.
7. Restart both servers; rebuild the frontend for production. Verify map loading, one search, a
   selected place, and attribution visibility. Map ID/style setup is an external Cloud Console step;
   importing the JSON file into this repository alone does not apply it to Google's map.

Set project quotas and billing alerts to match your budget. Backend limits are intentionally basic:
120 autocomplete, 60 details, and 60 nearby requests per rolling minute **per process**, shared by all visitors.
They reset on restart and multiply across workers. Configure provider quotas for a project-wide cap;
use a shared limiter before scaling to multiple application workers. Invalid requests do not consume
provider calls. Provider failures are returned as sanitized `503` errors; request-limit errors are
`429` with `Retry-After`. The backend never retries provider calls; the nearby UI backs off after failures.

Google's logo/legal attribution stays on the map's bottom edge, below the preview card. The search
dropdown includes text attribution to Google Maps, and previews render any returned provider
attributions. Google search content is not written to a database, localStorage, or backend cache. App Places
retain only optional provider Place IDs alongside their own user-authored data. Names and map points
for new app Places are supplied separately by the user; provider storage rules still apply. Add public Terms/Privacy pages incorporating Google's requirements
before a public production launch.

## Verification

Run `npm run lint`, `npm run build`, `npm run test:browser`, and the backend pytest and Ruff checks.
The browser suite supplies dummy Google credentials to its own development server, intercepts the
external SDK, and exercises the production adapter with a deterministic map stand-in. Places HTTP
responses are mocked for browser and backend tests; CI does not require live Google billing or keys.
Use a separately configured dev server for a real Google smoke test; the mocked suite does not
validate account billing, API key restrictions, map style publication, or Google's tile rendering.

References: [Maps loader](https://developers.google.com/maps/documentation/javascript/load-maps-js-api),
[Advanced Markers](https://developers.google.com/maps/documentation/javascript/advanced-markers/overview),
[cloud styles](https://developers.google.com/maps/documentation/javascript/cloud-customization/overview),
[Places session tokens](https://developers.google.com/maps/documentation/places/web-service/place-session-tokens),
[Nearby Search](https://developers.google.com/maps/documentation/places/web-service/nearby-search),
[Places policies](https://developers.google.com/maps/documentation/places/web-service/policies).
