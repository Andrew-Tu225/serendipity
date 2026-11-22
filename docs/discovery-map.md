# Discovery map

Discover is a live Google map with custom markers and place search. The tab loads the SDK on first
use and begins at London, Ontario (42.9849, -81.2453), zoom 13. Browsing pins combine app-reviewed Places
in PostgreSQL with temporary Google Nearby Search results and the signed-in recommendations overlay. All use our custom marker design: smaller,
neutral category pins for Google places, ratings and friend highlights for app Places. Dense pins of every source share counted clusters. Existing pins persist
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
Place previews use the updated merged design: a description, first photo shared in loaded app
reviews, falling back to a fresh Google place photo (or a placeholder), rating summary, app reviews, and recommendation evidence in a larger
scrolling card. App review requests wait for the active viewer identity to be ready. Discover
retains live global place search and the stable map renderer.
The separate Home tab mounts the new landmark carousel and Experience feed; its scoped layout
styles do not replace map styles. Home images use explicit dimensions rather than absolute fill.
Reviewed Places retain their original white pins; personal recommendations are amber and friends’ recommendations purple. No legend is shown.
Recommended and base Places merge by UUID, preserving aggregate ratings. Exact Google IDs suppress
duplicate provider pins. A followed-user review is white unless the recommendations API classifies
the Place as a friend recommendation. Selection retains its layer colour. Empty or failed ranking
requests leave the original results visible. Optional Google controls, including zoom buttons and keyboard
shortcuts, are disabled; touch gestures and the custom location button remain available. Google's
required logo, map attribution, and legal notices remain visible along the bottom edge.
The search and location controls share one two-column row: search uses the remaining width and the
location button reserves 48 px, with a 10 px gap. The location button has a 48 px touch target and a "Use my current location" tooltip. It is disabled
while the map is loading or a location request is pending; location is still requested only on tap.

Search waits for two trimmed characters and a 300 ms pause, then requests up to five suggestions,
biased toward a 25 km circle around the current map center. Searches remain global. The dropdown
supports arrows, Enter, Escape, and pointer selection. Clearing the input resets the session token;
it leaves the selected place and map position intact. A UUID groups suggestions and the selected
details request into a Google autocomplete session, then is discarded. A failed place-details selection retries that destination directly rather than restarting autocomplete. Superseded requests are
aborted and stale responses ignored. Provider billing still follows Google's requested-field SKUs.

## Overlapping nearby pins

Compact pins have a fixed 44 px interaction area with 24 px nearby icons and 30 px app icons.
Names and ratings live in an independently positioned caption, so hiding labels never moves the
pin anchor. The place name identifies the destination; friend identity and evidence remain in the preview.

All loaded Places, including Google nearby destinations, share one SuperCluster calculation. Dense
areas show counted groups; expanding them reveals the same SDK marker instances. The adapter no
longer hides nearby icons independently. Selected Places temporarily leave clustering and remain
visible. A colour/evidence change updates priority without changing membership or attaching hidden
cluster members. `StableClusters` reconciles the result by group membership rather than using the
package renderer, which recreates every group after a membership change. Cached pans perform no
SDK attachment writes; new batches replace only affected groups, attaching replacements before
removing old groups. Reconciliation waits until the camera stops moving and runs in one animation
frame. Group and individual marker clicks use the Advanced Marker DOM `gmp-click` event.

Only captions participate in the settled collision pass, 150 ms after camera/marker changes. It
measures visible icon/caption footprints, using the nearest world copy at the date line, and allocates
labels in order: selected Place, friend recommendation, personal recommendation, review, nearby Place.
Existing labels win within a priority. Selected captions stay visible; other captions avoid visible
icons, groups, the location dot, and higher-priority labels. Hidden cluster members reserve no space.
The pass never attaches or detaches a marker. All SDK markers use `REQUIRED`, so native collision
hiding cannot silently remove destinations. White reviews, amber personal recommendations, and
purple friend recommendations stay distinct; no legend is displayed.

## Recommendation overlay

The earlier gaps had three separate causes: per-zoom search grids exhausted request slots, the
nine-area sampler left unqueried space, and icon decluttering hid loaded destinations without a
cluster count. The Toronto 430×740 zoom-14→17 regression case previously wanted 22 searches;
with uncapped responses the stable grid now needs six. The production clustering algorithm also
verifies that all 20 destinations in a dense fixture remain represented when grouped or expanded.
Ranking is a highlight overlay and does not participate in base-map loading readiness.

`GET /api/recommendations` supplies up to 30 results per bbox expanded 25% beyond each visible
edge, preserving kind, score, positive supporting logs, and relation labels. Rankings describe this
buffered browsing area rather than the exact viewport. Up to eight complete ranking snapshots stay
fresh for one minute; the active snapshot wins while it contains the viewport. Small pans, focus,
and tab return reuse fresh coverage and applicable in-flight requests. Crossing coverage starts a
new full buffered ranking after 500 ms of idle; date-line areas use two ordinary bboxes. Expiry
refreshes the same area quietly. Review submission invalidates rankings, and account changes clear
personalized snapshots. Superseded requests are cancelled and stale responses ignored.

Full successful rankings replace only recommendation membership. Existing results remain during
refreshes and failures. The original review/nearby layers continue independently. Pins leaving
recommendations revert to their base colour without replacing stable markers. A successful review
updates the white base layer. See [discovery-data.md](discovery-data.md) for colour precedence and caching.

## Nearby places without app reviews

`GET /api/places/nearby?latitude=…&longitude=…&radius=…` calls Places API (New) Nearby Search
through the existing typed client, router, service, and provider integration. No database access or
schema migration is involved. The server limits the radius to 50–5,000 m and requests at most 20
distance-ranked results, including food/drink, parks/trails, culture, activities, and selected shops.
Utilities, offices, and residential addresses are not requested. The field mask excludes Google
ratings, reviews, and photos. Names, coordinates, categories, links, and attributions support display.

After a 500 ms map-idle pause, one `NearbyDiscovery` queue searches every visible level-13 root
cell. Root keys are independent of zoom, so zooming and returning to a fresh area reuse the same
responses instead of fetching a new grid for every zoom band. Around Toronto a root cell is about
3.5 km across; its enclosing circle stays within the server's 50–5,000 m radius contract. Each Google
ID is deduplicated, and the most recently completed response wins. Unchanged data reuse objects and
marker instances. App Places with exact linked Google IDs take precedence.

Nine scattered samples are no longer treated as sufficient coverage. All visible root cells are
queued, with unseen root areas first, then smaller dense-area searches, then stale revalidation.
Within a priority, searches closest to the camera centre run first. Up to three requests run at once,
and an 18-attempt rolling-minute budget controls provider work. When the budget is exhausted, loaded
places remain visible. A pause message appears only when no destinations are available and no
request is still running; further searches resume automatically. Requests that
leave buffered view coverage are cancelled; late responses cannot repopulate a superseded area.

A response containing 20 Places may have reached Google's cap. Such cells are subdivided into
intersecting child cells only when inspecting neighbourhoods: zooms 13–14 search roots only, zoom
15 permits level-14 children, zoom 16 permits level-15 children, and zoom 17+ permits level 16.
City-overview responses no longer immediately spawn child searches and exhaust the minute budget.
Responses below the cap are reused across zooms. Parent pins stay available during refinement. This fills dense
neighbourhoods progressively without repeatedly re-querying sparse areas. Fewer than 20 results are
not a promise of an exhaustive Google listing; category filtering and provider ranking still apply.
See [Google Nearby Search](https://developers.google.com/maps/documentation/places/web-service/nearby-search)
for the 20-result maximum and distance ranking.

Responses stay fresh for five minutes. Failures back off per cell for one minute, so one failing area
does not stop healthy areas. Manual retry keeps cache and billing-budget history. The cache targets
256 cells, evicting offscreen data first; current required areas are protected. Unused responses age
out after 15 minutes. Hiding the tab pauses requests/timers and retains reusable data.

World/continent views (zoom below 9 or over 512 visible root cells) show an explicit zoom-in hint;
they do not queue an unbounded world scan. Loading readiness depends only on reviewed-place and
nearby searches, not recommendation ranking. Generic empty messages require successful completion
of both base searches and zero visible destinations. Budget waits, pending requests, errors, and
zoom-limited views have distinct states. Recommendation highlights refresh independently.

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

## Selected-place photos

`GET /api/places/{google_place_id}/photo` returns `{photo: null}` when Google has no photo,
or a photo with an 800 px image URL, author credits and available source/report links.
Only selected popups request photos; nearby/search field masks remain unchanged. Backend
credentials stay private. Photo metadata and URLs are not stored or cached. Credits appear
beside the image. Review photos take precedence, including fallback after an image fails.
Closing or changing the selection cancels the request; photo failure never blocks reviews.
Photo requests have a separate 60-per-minute, per-process limit. No new configuration is needed.
