# Local London demo data

Discover initially centers on downtown London, Ontario (42.9849, -81.2453), zoom 13. Device location
still requires tapping the location button; global Google search remains available.

## Seed

After installing frontend/backend dependencies and applying `uv run alembic upgrade head`, run from
the repository root:

```bash
npm run db:seed -- --dry-run
npm run db:seed
```

The command reads `DATABASE_URL` from the environment or `backend/.env`. It requires the existing
`backend/.venv` and a loopback PostgreSQL/Psycopg URL. No additional variables or dependencies are
needed. Equivalent backend command: `uv run python -m scripts.seed_london`.

It inserts 24 real London place names with approximate, independently authored demo pin positions,
six users named **Demo Elena**, **Demo James**, **Demo Alex**, **Demo Maya**, **Demo Noah**, and
**Demo Priya**, 101 Experiences, 12 directed follows, and 18 bookmarks. Every review starts with
**[Mock review]**. Ratings/verdicts are fictional and do not describe real visitors' opinions. There
are four reviewers per Place, positive/neutral/negative ratings, and five older repeat visits to
exercise latest-per-author summaries. The seed does not fetch Google content or populate provider IDs.

The Places include Covent Garden Market, The Early Bird, Black Walnut Bakery Cafe, Thaifoon, The
Mule London, Milos Craft Beer Emporium, several Covent Garden Market merchants, Museum London,
Eldon House, Grand Theatre, Central Library, Victoria Park, Ivey Park, Harris Park, Gibbons Park,
Springbank Park, Thames Park, Forks of the Thames, Blackfriars Bridge, and Dundas Place. Positions
are illustrative, not navigation coordinates. Some locations require panning west or north of the
initial view; nearby downtown pins cluster.

Venue references: [Tourism London's downtown listings](https://www.londontourism.ca/summer),
[Covent Garden Market directory](https://coventmarket.com/market-directory/),
[Milos](https://www.londontourism.ca/milos-craft-beer-emporium),
[Museum London](https://museumlondon.ca/visit/), [Eldon House](https://eldonhouse.ca/),
and [City of London parks](https://london.ca/living-london/parks-facilities/parks/parks-london).
Review text, ratings, dates, and approximate pins are authored fixtures, not scraped provider data.

Stable UUIDs and conflict-safe inserts make the command repeatable: an unchanged dataset adds no
rows on its second run, preserves existing records, and does not double-count taste scores. The seed
and taste updates commit together. Visit dates are relative to the first insertion date; re-running
does not rewrite previous mock visits. It never seeds automatically during app startup.

To highlight demo users as friends for a real signed-in account, copy its internal UUID from the
diagnostic `/success` page and explicitly run:

```bash
npm run db:seed -- --viewer-id YOUR_USER_UUID
```

This adds follows from that account to the first three demo users. Omitting the flag leaves existing
accounts' follows alone; signed-out visitors can still see all public mock ratings and reviews.

## Clear

Inspect row counts first, then explicitly confirm the configured local database's name:

```bash
npm run db:clear -- --dry-run
npm run db:clear -- --confirm serendipity
```

Replace `serendipity` if `DATABASE_URL` uses another database name. The command rejects missing or
incorrect confirmation, remote hosts, and URL options that override the displayed connection target.
Output shows only host, port, database, and counts, never credentials.

Clearing deletes **all application rows**, including real local users, sessions, Places, Experiences,
follows, bookmarks, and taste profiles. It signs out local accounts. It preserves tables, indexes,
Alembic's migration version, and unrelated tables/databases. The delete operation commits once;
failure rolls back the whole reset. It does not drop or recreate PostgreSQL or Docker volumes.
Equivalent backend command: `uv run python -m scripts.clear_local_db --confirm serendipity`.

Run `npm run db:seed` again to restore the mock dataset after clearing. Seed/reset are explicit
development commands, not HTTP endpoints. Tests exercise seeding, idempotency, viewer follows,
rollback, and local-target guards; the clear/reseed test uses an isolated PostgreSQL schema and
never clears application data in the configured development schema.
