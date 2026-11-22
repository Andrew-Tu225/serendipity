# Discovery map

Discover is a live Google map with custom markers and place search. The tab loads the SDK on first
use and begins at London, Ontario (42.9849, -81.2453), zoom 13. Browsing pins come from app-reviewed Places
in PostgreSQL, with Serendipity ratings and friends' reviews. Dense pins cluster. Existing pins persist
across viewport updates; nearby areas are prefetched and newly exposed rectangles load in the
background. There are no
hard-coded demo pins or demo fallback on errors. Selecting a marker opens its app reviews; closing
the preview keeps the marker available. See [discovery-data.md](discovery-data.md) for database
queries, review submission, public browsing, and exact Google-ID matching.

Discover fills the phone frame above navigation. The simulated status bar and page header are hidden.
Search floats at the top with safe-area spacing, with a crosshair location button to its right, and
place previews clear the raised Add button and Google's attribution. The desktop phone frame stays.
Previews and search suggestions scroll internally when needed. Selecting a Google result fits its
viewport or centers at zoom 16. Unknown Google Places remain temporary search markers, displaying
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
120 autocomplete and 60 details requests per rolling minute **per process**, shared by all visitors.
They reset on restart and multiply across workers. Configure provider quotas for a project-wide cap;
use a shared limiter before scaling to multiple application workers. Invalid requests do not consume
provider calls. Provider failures are returned as sanitized `503` errors; request-limit errors are
`429` with `Retry-After`. No automatic provider retries incur additional calls.

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
[Places policies](https://developers.google.com/maps/documentation/places/web-service/policies).
