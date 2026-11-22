# Social backend API

These endpoints provide persistent social behavior without changing the frontend. Reviews are
called **Experiences** in APIs and storage. All paths below begin with `/api`. Interactive response
schemas are available at `/api/docs`; OpenAPI is at `/api/openapi.json`.

## Setup and authentication

Run `cd backend && uv run alembic upgrade head` before starting the backend. Migration `0004`
adds `experience_likes`, `experience_bookmarks`, and `experience_comments`; it preserves existing
Places, Experiences, follows, bookmarks, and sessions. No new dependencies or environment variables
are required. Downgrading to `0003` deletes the three new tables and their interaction data.

Public reads require no login. Optional authenticated viewers receive their own relationship
flags. An expired or invalid session is treated as anonymous on those reads. `/feed` and all
`/me/bookmarks/*` operations require a valid session. Every mutation requires the existing
HttpOnly session cookie, trusted `Origin`, and `X-CSRF-Token` from `GET /api/auth/me`. The server
always determines the acting user from that session. Use the frontend API-client layer when
integrating these endpoints; this change does not add frontend clients or UI.

Every new endpoint returns `Cache-Control: no-store`, including validation and authorization errors.
Public responses never include emails, Auth0 subjects/claims, session data, or other users' saves.

## Endpoints

| Method | Path | Access | Result |
|---|---|---|---|
| GET | `/users?query=Alex` | Public | Page of user summaries matching display name |
| GET | `/users/{user_id}` | Public, personalized | Profile, counts, relationship flags |
| GET | `/users/{user_id}/experiences` | Public, personalized | Page of all the user's Experiences |
| GET | `/users/{user_id}/followers` | Public | Page of users following this user |
| GET | `/users/{user_id}/following` | Public | Page of users this user follows |
| PUT | `/users/{user_id}/follow` | Mutation | `{user_id, is_following: true}` |
| DELETE | `/users/{user_id}/follow` | Mutation | 204 |
| GET | `/feed` | Signed in | Page of Experiences from currently followed users |
| GET | `/experiences/{experience_id}` | Public, personalized | One exact Experience, including an older visit |
| PUT | `/experiences/{experience_id}/like` | Mutation | `{experience_id, is_liked: true, like_count}` |
| DELETE | `/experiences/{experience_id}/like` | Mutation | 204 |
| GET | `/experiences/{experience_id}/likes` | Public | Page of user summaries who liked this Experience |
| GET | `/experiences/{experience_id}/comments` | Public | Page of comments |
| POST | `/experiences/{experience_id}/comments` | Mutation | Created comment (201) |
| PATCH | `/comments/{comment_id}` | Author mutation | Updated comment |
| DELETE | `/comments/{comment_id}` | Author mutation | 204 |
| GET | `/me/bookmarks/experiences` | Signed in | Page of `{experience, saved_at}` |
| PUT | `/me/bookmarks/experiences/{experience_id}` | Mutation | `{experience, saved_at}` |
| DELETE | `/me/bookmarks/experiences/{experience_id}` | Mutation | 204 |
| GET | `/me/bookmarks/places` | Signed in | Page of `{place, saved_at}` |
| POST | `/me/bookmarks/places` | Mutation | `{place, saved_at}` (200, including repeat saves) |
| DELETE | `/me/bookmarks/places/{place_id}` | Mutation | 204 |

UUID path parameters reference app records, distinct from Google Place IDs. Existing
`GET /api/places/{place_id}` still returns provider details and requires its existing session-token
parameter; do not use that endpoint as an app Place detail endpoint.

### Request bodies

Comment POST and PATCH accept `{"body": "Great recommendation!"}`. Text is trimmed, plain text,
and must contain 1–2,000 characters after trimming. Only the comment's author may edit or delete
it, including when someone else owns the Experience. Comments have no replies or likes.

Place bookmark POST accepts exactly one of:

```json
{"place_id": "00000000-0000-0000-0000-000000000001"}
```

```json
{
  "new_place": {
    "name": "My quiet spot",
    "latitude": 43.65,
    "longitude": -79.4,
    "category": "park",
    "google_place_id": "optional-provider-id"
  }
}
```

New-place fields use the same validation as review creation: trimmed 1–120 character name,
finite valid coordinates, existing category enum (default `restaurant`), optional Google ID.
They represent a user-authored name and chosen map point. Provider names, addresses, and coordinates
are not fetched or automatically copied into the database. An existing Google ID reuses the app
Place without overwriting it. Place creation and saving commit atomically. No review or taste
update is created, and unreviewed Places remain outside reviewed-place map discovery.
For a new Place without a Google ID, reuse the returned app `place_id` for subsequent saves;
resubmitting `new_place` without an identifier creates a distinct user-authored Place.

Other PUT/DELETE endpoints have no request body. Writable JSON schemas reject extra fields;
client-supplied ownership fields cannot change the acting user.

### Response shapes

- A user summary is `{id, display_name, avatar_url}`. Names use the existing 60-character public
  display convention, with `Anonymous` for missing/blank names.
- A profile adds `experience_count`, `follower_count`, `following_count`, `is_following`,
  `follows_you`, and `is_self`. `is_following` means the viewer follows this profile;
  `follows_you` means this profile follows the viewer. Anonymous relationship flags are false.
- A Place summary is `{id, name, latitude, longitude, category, google_place_id}`.
- An Experience is `{id, author, place, rating, verdict, review, photo_urls, visited_on, created_at,
  like_count, comment_count, is_liked, is_bookmarked}`. `author` and `place` are the summaries above.
  Counts are public; liked/bookmarked flags belong only to the current viewer and are false for
  anonymous readers. There is no public saved-by list or save count.
- A comment is `{id, experience_id, author, body, created_at, updated_at}`. Editing preserves
  `created_at`. PostgreSQL timestamps include timezone information.
- Saved collections wrap the corresponding Experience or Place in `{experience, saved_at}` or
  `{place, saved_at}`. They are private and only accessible through `/me`.

### Pagination, ordering, and errors

Every collection accepts `offset` (default 0, minimum 0) and `limit` (default 20, range 1–100).
Responses are `{"items": [...], "next_offset": 20}`; `next_offset` is null at the end. Queries
paginate in SQL and retrieve one extra row to detect the next page. Offset pages can shift if
records are created or deleted between requests; reload from offset 0 to refresh a timeline.

Comments are oldest first. Experience history and the feed use publication time (`created_at`),
not visit date, newest first. Repeat visits remain separate entries. Saves, follows, and likes
are newest first by interaction timestamp. All timestamp orders use the record/target UUID as
a deterministic tie breaker. User search requires a trimmed 2–100 character `query`, uses literal
case-insensitive substring matching on display names (not emails), and sorts by lowercased name
then UUID. `%` and `_` are literal search characters, not wildcards.

Successful reads, PUTs, PATCHes, and place-bookmark POSTs return 200; comment POST returns 201.
DELETE returns 204 with no body. Adding an existing follow/like/save or removing an absent
relationship is safe to repeat while the target exists. Repeated saves preserve the original
save timestamp. Deleting an already deleted comment returns 404. Self-likes and saving one's own
Experiences are allowed; self-follow is rejected.

Errors use existing FastAPI conventions: 401 for required authentication, 403 for CSRF/origin
or comment ownership, 404 for missing target records, 422 for malformed UUIDs/fields/pagination
or self-follow, and 503 for database unavailability.

## Behavior and implementation

Social routers delegate to `SocialService`, which owns permissions and commit/rollback boundaries;
`SocialRepository` owns SQL. New-place saving reuses `DiscoveryRepository.create_place` and its
concurrent Google-ID deduplication. Unique composite keys and conflict-safe inserts prevent duplicate
follows, likes, or saves. Foreign keys cascade interaction cleanup when their user or Experience is
removed. Social counts and viewer state are loaded in batches for Experience lists.

Friend means directed follow, with no approval or mutual-friend requirement. The feed is computed
from current follows and published Experiences, so it includes historical posts from newly followed
users and removes them after unfollow. It excludes the viewer's own posts and contains no
likes/comments/follow activity.

Review and Place bookmarks are independent. Only Place bookmarks affect the existing recommender's
saved-Place exclusion. Follows immediately affect friend highlighting and recommendation trust.
Likes, comments, and review bookmarks do not modify ratings or taste profiles. Experiences remain
immutable; their existing creation endpoint is `POST /api/discovery/experiences`. Existing discovery
and recommendation response schemas remain unchanged.

Usernames, profile editing, private accounts, follow requests, replies, comment likes, notifications,
custom lists, moderation, uploads, and UI integration remain future work.

## Validation

Run `cd backend && uv run pytest` and `uv run ruff check . && uv run ruff format --check .`.
Set `TEST_DATABASE_URL` to a local PostgreSQL URL when running pytest to include migration parity,
foreign-key/constraint, and concurrent social-write checks. PostgreSQL tests create and remove
isolated schemas; they do not migrate or delete application tables in the public schema.
