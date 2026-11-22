# Local London fixture data

Run `npm run db:seed` from the repository root with local PostgreSQL running and migrations
applied. This inserts 20 fictional people, 24 independently authored London destinations and
171 fictional Experiences. Each person has at least five visits. Names and review text use
ordinary product copy; the records remain synthetic and do not represent real visitors.
Stable UUIDs and internal `demo:london:*` identities identify fixture records.

## Existing and future accounts

Every non-fixture account in the local database receives mutual follows with Elena, James,
Alex, Maya, Noah and Priya. Repeating the command backfills new accounts without duplicating
rows or adding taste scores again. The existing fixture-to-fixture follows remain intact.
The legacy `--viewer-id UUID` option validates that account; all accounts are connected regardless.

Set `LOCAL_SAMPLE_FRIENDS_ENABLED=true` in `backend/.env`, then restart FastAPI, to connect
new accounts during their first sign-in. This defaults to false and requires loopback app and
PostgreSQL targets without connection-target overrides. Authentication never seeds places or
reviews and never restores follows on a later login. If fixtures are missing, login proceeds
with a server diagnostic; run the seed command to backfill relationships.

The seed also removes legacy `Demo ` names and `[Mock review] ` prefixes, but only for known
fixture IDs with their expected original text. User edits and unrelated accounts are preserved.
IDs, ratings, visit dates, bookmarks, follows and existing taste scores stay intact.

## Google place links and photos

Normal seeding now backfills verified Google Place IDs for all 24 destinations, including
name variants and large parks confirmed against Google Places on 2026-11-22. Only IDs are
retained. Repeating the seed preserves authored names/coordinates and existing conflicting
provider links; conflicts are logged rather than overwritten. No API call is needed to apply
these known links to a fresh or previously seeded local database.

Run `npm run db:seed -- --link-google` with `BACKEND_API_KEY_GOOGLE` configured. It skips already-linked destinations and searches
remaining authored names in London, Ontario and accepts only one exact normalized-name match
within 750 metres of the authored pin. Ambiguous, missing and conflicting matches are reported;
they are never merged automatically. Only Google Place IDs are persisted. Searches are paid
Places API calls; no Google names, coordinates, photos or photo URLs are retained.

Linked destinations retrieve fresh attributed Google photos only when selected on the map.
Unresolved destinations can still display user-shared photos and otherwise show a neutral
placeholder. If linking fails, seed inserts remain committed and link updates roll back.

## Preview and reset

`npm run db:seed -- --dry-run` reports counts without connecting, searching Google or writing.
Seed and reset reject remote databases. To inspect deletion counts run
`npm run db:clear -- --dry-run`; to clear application rows use
`npm run db:clear -- --confirm serendipity` (substitute the configured database name).
This retains schema and migration history. Rerun the seed afterward to restore fixtures.
Never reset a database merely to refresh fixture labels or friend relationships.
