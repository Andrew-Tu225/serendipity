# Discovery map

Discover is a live Google map with custom recommendation markers and explicit place search.
The tab loads the SDK on first use and begins at London, Ontario (42.9849, -81.2453), zoom 13.
Normal pins come only from `GET /api/recommendations` for the visible area, up to 30 per bbox.
Friend, similar-taste, and explore results carry the API's positive review evidence. The map does
not automatically fetch all reviewed database Places or Google nearby destinations. Empty results
stay empty and errors offer retry. Dense recommendations cluster. Home cards focus the same Place
in Discover. See [discovery-data.md](discovery-data.md) for viewport snapshot caching, review writes,
and explicit search selection. The app requires sign-in and completed category onboarding.

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

## Explicit search and optional provider APIs

Selecting a Google search result checks the database by its exact Google ID before showing an
empty-review message. A database failure is shown as an error rather than “no reviews”. A searched
Place outside the recommendation set gets one temporary selection marker; closing its preview
removes that marker. Existing app records open their real reviews. Unknown places use the existing
first-review flow with a user-authored name and chosen map point. Search content stays transient.

`GET /api/places/nearby` remains available as a public provider endpoint, with validated coordinates,
a 50–5,000 m radius, and up to 20 distance-ranked destinations. It is not called by the map UI.
The automatic cell-search hook, client request budget, and nearby pin cache have been removed.
Map loads and explicit autocomplete/details requests retain their existing provider billing.

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
`429` with `Retry-After`. The backend never retries provider calls.

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
