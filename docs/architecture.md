# Application architecture

Serendipity uses a Next.js frontend, a FastAPI backend, and PostgreSQL. Apply the same flow to authentication and future Place, Experience, Bookmark, and Friend features:

```text
UI component or hook
  → typed frontend API client
  → /api/* through the Next.js proxy
  → FastAPI router
  → service
  → repository
  → PostgreSQL
```

Responses travel back through those layers to the UI. FastAPI owns data validation, authentication, and business logic. Next.js renders the interface and proxies API traffic.

The Figma discovery interface is mounted at `/`. The authentication entry point is `/login`, and `/success` displays the verified identity and stored user after authentication. The homepage does not redirect to login. Keep the Figma shell's styling alongside the shared auth color tokens; auth pages use their own light/dark backgrounds so their text and buttons remain readable.

## Layer responsibilities

| Layer | Location | Responsibility |
|---|---|---|
| UI | `src/app/`, `src/components/`, `src/hooks/` | Call domain API clients and render loading, success, and error states. |
| API client | `src/lib/api-client/` | Define typed domain methods; centralize HTTP requests, backend URLs, cookies, CSRF headers, cancellation, and error parsing. |
| Frontend types | `src/types/` | Describe the data returned to components. |
| API endpoints and schemas | `backend/app/api/`, `backend/app/schemas/` | Define HTTP endpoints and validate request/response shapes with Pydantic. |
| Service | `backend/app/services/` | Apply business rules and resource permissions, coordinate repositories and integrations, and commit or roll back transactions. |
| Repository | `backend/app/repositories/` | Read and write database records using an injected SQLAlchemy session. |
| Models and database | `backend/app/models/`, `backend/app/database.py` | Define persistence models and provide database sessions. |
| Integration | `backend/app/integrations/` | Communicate with external providers such as Auth0. |

Group modules by domain within each layer. For example, an auth client belongs beside other domain clients, while user database queries belong in the user repository.

UI components do not make ad hoc `fetch` calls or contain backend endpoint strings. Routers delegate application work to services. Database queries belong in repositories. Repositories do not commit transactions or create HTTP responses; the service controls the transaction so related writes succeed or fail together. Add schema changes through Alembic migrations in `backend/migrations/`.

## Current authentication flow

The user-creation entry point is `GET /api/auth/callback`. Its implementation follows this chain:

```text
backend/app/api/auth.py: callback()
  → backend/app/services/auth.py: AuthService.finish_login()
  → backend/app/repositories/users.py: UserRepository.upsert_from_auth0()
  → PostgreSQL users table
```

The repository creates the user on first login and updates the same account on later logins, matched by Auth0 `sub`. User creation happens only after the backend verifies the Auth0 response.

1. The login UI calls `authClient.startLogin()`. The client navigates the browser to `/api/auth/login`; full navigation lets FastAPI redirect to Auth0's hosted login.
2. FastAPI uses the Auth0 integration to start Authorization Code flow with PKCE. Temporary login state is stored through the session repository in Postgres.
3. Auth0 returns to `/api/auth/callback`. The backend consumes the one-use login state and validates the returned identity.
4. The auth service upserts the user through `UserRepository`, using the verified Auth0 `sub` as the identity link. It creates a fresh session through `SessionRepository` and commits before redirecting to `/success`.
5. The success UI calls `authClient.getSession()`. `GET /api/auth/me` passes through the auth router and service to the session and user repositories. Its response includes the verified Auth0 claims snapshot, the current user row from Postgres, and a CSRF token.
6. The page renders the claims and user JSON. Its sign-out button calls `authClient.signOut()`, which submits the CSRF-protected logout request and navigates to the returned Auth0 logout URL after the service revokes the local session.

The browser authenticates API requests with an HttpOnly session cookie. Auth0 credentials stay in backend configuration, and raw Auth0 tokens are discarded after callback processing. Authenticated responses use `Cache-Control: no-store`; the diagnostic page does not render the CSRF token.

Future protected routes use `CurrentUser`. State-changing routes additionally use `VerifiedMutation` for CSRF and origin checks. Services must check resource ownership using the authenticated user; a user ID supplied by the browser is not proof of ownership.

## Adding a feature

Create and switch to a feature branch from the latest appropriate base before editing files. Keep each distinct change on its own branch and pull request; continue review fixes on the existing pull request branch.

1. Define its Pydantic API contracts and matching frontend types.
2. Add models and an Alembic migration if persistence changes, then implement the repository queries.
3. Add the service behavior, permissions, and transaction boundary, and expose it through a domain endpoint module in `backend/app/api/`, mounted under `/api`.
4. Add typed domain methods to the frontend API client and call them from the UI or feature hook.
5. Verify the behavior at the relevant layers and update the affected documentation in the same change. Keep this architecture note, product decisions, setup instructions, and environment examples aligned with the implementation.

After verification, commit with a descriptive conventional commit message, push the feature branch, and open a pull request. The pull request should explain the problem, resulting behavior, implementation choices, checks performed, and setup or migration requirements. Note material limitations or checks that could not be completed.
