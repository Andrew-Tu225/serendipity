# Discovery map

Discover is a live, public Google map with custom HTML/SVG markers and place search. Open the tab
to load the map SDK. It begins at downtown Toronto (43.651, -79.386), zoom 13, with six illustrative
places. Each Place has one geographic marker with an illustrative Serendipity rating; three include
fake friends' reviews and recommendations, labeled **Demo**. Ratings and review counts are authored
fixtures, not Google ratings or live app data. The five-point scale is provisional for this prototype.
Selecting a marker opens its preview. Selecting a Google search result fits its viewport or centers
the camera at zoom 16 and replaces the previous temporary search marker. Google results show their
name, address, and external Maps link, with a branded placeholder instead of photos. They never
inherit demo friend activity. Closing a preview leaves its marker available.

Discover fills the phone frame from its top edge to the bottom navigation. The simulated status bar
and page header are hidden on this tab. Search floats at the top with safe-area spacing, the demo
legend and location button sit below it, and the selected-place preview floats above the raised Add
button and Google's bottom-edge attribution. The map has no inset border or rounded card; desktop
keeps the existing outer phone frame. Short previews and search suggestions scroll internally.

Search waits for two trimmed characters and a 300 ms pause, then requests up to five suggestions,
biased toward a 25 km circle around the current map center. Searches remain global. The dropdown
supports arrows, Enter, Escape, and pointer selection. Clearing the input resets the session token;
it leaves the selected place and map position intact. A UUID groups suggestions and the selected
details request into a Google autocomplete session, then is discarded. Superseded requests are
aborted and stale responses ignored. Provider billing still follows Google's requested-field SKUs.

The location button uses browser geolocation on tap, with a 10-second timeout. Success shows a blue
location indicator and centers at zoom 15; denial leaves search and the camera usable. Switching
tabs preserves camera and selection, cancels pending search, and does not request location again.
Reloading the page resets this memory-only state. Filters, persistence, and clustering are deferred.
The Next.js development badge is disabled so it does not cover floating search or mobile navigation.
Next.js still surfaces compile and runtime errors.

## Connecting real app data later

Google supplies the basemap and searchable directory; Serendipity supplies discovery markers. The
intended browsing layer includes all app-reviewed Places in the visible area, highlighting Places
reviewed by friends with their avatars and Experiences. These indicate past visits, not live friend
locations. This iteration demonstrates that behavior only with Toronto fixtures. Searching elsewhere
still works globally but does not invent local ratings or friend activity.

For the persistent integration, selecting a city uses Google's returned viewport to move the camera.
After camera movement settles, a typed domain API client will request app-reviewed Places within
the visible bounds. FastAPI will query those Places through a service and repository in PostgreSQL,
returning Serendipity rating summaries and friend activity scoped to the authenticated viewer. A
specific business search can show a temporary Google marker even before it has any app reviews.
Only attach app activity when a provider Place ID matches a real app Place; never match by name alone.
Store the app's own Place identity separately from its optional Google Place ID. This follow-up needs
its own contracts, migrations, and integration with the social/Experience models; no viewport API or
persistence is introduced here. Provider field storage must follow the policies below.

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
attributions. Google data is not written to a database, localStorage, or backend cache. Future
persistent Places must distinguish our Place IDs/data from provider identifiers and honor Google's
field-specific storage rules. Add public Terms/Privacy pages incorporating Google's requirements
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
