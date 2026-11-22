# Local setup reference

Detailed configuration behind the README's Getting started section.

## Database

Docker Compose runs PostgreSQL 17. The default development database is `serendipity`, with username `serendipity` and password `serendipity_dev`. It is bound to `127.0.0.1:5433` so it does not clash with an existing server on port 5432.

- Keep `POSTGRES_*` and `DATABASE_URL` in `backend/.env` consistent.
- Change the port with `POSTGRES_PORT`, passing `--env-file backend/.env` to Compose.
- The named volume keeps data across restarts, and `docker compose stop db` stops the database without deleting it.
- Credentials are fixed when the volume is first initialized.

Run `cd backend && uv run alembic upgrade head` after pulling schema changes. Seeding and clearing are described in [local-demo-data.md](local-demo-data.md).

## Auth0

Create a development tenant and a **Regular Web Application**. Enable the database email/password connection with signup allowed. Then set:

| Auth0 setting | Local value |
|---|---|
| Allowed Callback URLs | `http://localhost:3000/api/auth/callback` |
| Allowed Logout URLs | `http://localhost:3000/login` |
| Application Login URI | `http://localhost:3000/api/auth/login` |

Set `AUTH0_DOMAIN` (the tenant hostname), `AUTH0_CLIENT_ID`, and `AUTH0_CLIENT_SECRET` in `backend/.env`. The backend requests `openid profile email`. No Auth0 API registration and no frontend Auth0 SDK are needed.

The application can also be provisioned through the official Auth0 MCP server (`npx -y @auth0/auth0-mcp-server init`). Account signup and browser authorization still need a person, and client secrets must never be committed or pasted into chat.

**Deployment:**
- Set `APP_BASE_URL` to the public HTTPS origin and set `COOKIE_SECURE=true`.
- Update the Auth0 URLs to match.
- Use a protected Postgres connection.

Configuration validation rejects non-local HTTP origins and insecure cookies.

**Sessions:**
- Sessions expire after 8 hours, and login attempts expire after 10 minutes.
- Expired rows are removed when a new login starts.
- Blocking an account in Auth0 does not revoke an existing local session.

## Google Maps

See [discovery-map.md](discovery-map.md) for enabling the APIs, key restrictions, and the vector Map ID and style. Key rules:
- The browser key (`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`) is public by design. Restrict it to the Maps JavaScript API and your site origins.
- The backend key (`BACKEND_API_KEY_GOOGLE`) must never have the `NEXT_PUBLIC_` prefix.
- Local development falls back to Google's `DEMO_MAP_ID`. Production needs an explicit Map ID.
- Restart the frontend after changing `NEXT_PUBLIC_*` values, because they are bundled at build time.

## Tests

The backend suite uses isolated SQLite databases and a mocked OIDC provider that issues real RSA-signed tokens. To also run the PostgreSQL concurrency tests, set `TEST_DATABASE_URL` to a PostgreSQL SQLAlchemy URL. Those tests create and remove their own schema.

Browser tests mock auth, the Google Maps SDK, Places responses, and discovery/review responses. They run a dedicated Next.js server on port 3039 with `.next-auth-test` output and dummy Maps credentials.
- Install Chromium once with `npx playwright install chromium`.
- `TEST_BASE_URL` targets an existing test server instead.
- `SERENDIPITY_DIST_DIR` isolates other Next.js builds from a running dev server.
