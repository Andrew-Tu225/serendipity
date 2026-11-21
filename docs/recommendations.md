# Recommendation System

Recommends Places to a user from Experiences (logs) written by people they follow and by people with similar taste. Every recommendation is backed by at least one real log, and those logs are returned with it so the map can show why the Place was picked.

This is the minimal version, sized for the hackathon demo (~10 users, ~60 Places). Section 5 lists what to add once real data shows a need.

## Principles

1. **No log, no recommendation.** A Place is recommended only if someone logged it positively, and that log is returned with it.
2. **Logs are shown regardless of follow status.** A similar-taste stranger's log appears at the pin, labelled with its relation to the viewer.
3. **Explainable.** The score is a sum over individual logs, so each recommendation can name the logs behind it.
4. **Recommendations are a separate layer.** Places the viewer already logged or bookmarked are shown by the plain social layer, not by the recommender.

## Decisions this design depends on

| Decision | Value | Status |
|---|---|---|
| Social model | Directed follow. "Friend" means a user the viewer follows. | Decided |
| Log visibility | All Experiences are public. | Decided |
| Rating scale | 1.0–5.0 in 0.5 steps | Provisional (plan §8) |
| Category taxonomy | Fixed category list (below) | Provisional |

---

## 1. Data schema

Field types map onto Pydantic models in `backend/app/models/`.

**User**

| Field | Type | Constraints |
|---|---|---|
| `id` | string | PK |
| `display_name` | string | 1–60 chars |
| `avatar_url` | string \| null | |

**Follow**

| Field | Type | Constraints |
|---|---|---|
| `follower_id` | User.id | PK part |
| `followee_id` | User.id | PK part; `follower_id != followee_id` |

**Place**

| Field | Type | Constraints |
|---|---|---|
| `id` | string | PK |
| `name` | string | 1–120 chars |
| `lat` | float | −90 to 90 |
| `lng` | float | −180 to 180 |
| `category` | Category | required |

`Category` enum: `restaurant`, `cafe`, `bar`, `trail`, `park`, `viewpoint`, `gym`, `climbing`, `museum`, `gallery`, `bookstore`, `shop`, `attraction`, `other`.

**Experience** (a log)

| Field | Type | Constraints |
|---|---|---|
| `id` | string | PK |
| `user_id` | User.id | |
| `place_id` | Place.id | |
| `rating` | float | 1.0–5.0, step 0.5 |
| `verdict` | enum | `recommend` \| `avoid` \| `neutral`, default `neutral` |
| `review` | string \| null | ≤ 2000 chars |
| `photo_urls` | list[string] | 0–10 |
| `visited_on` | date | not in the future |

A user may log the same Place more than once; the recommender uses only the latest Experience per `(user_id, place_id)`.

**Bookmark**

| Field | Type | Constraints |
|---|---|---|
| `user_id` | User.id | PK part |
| `place_id` | Place.id | PK part |

**TasteProfile** (stored, one row per user and category)

| Field | Type | Constraints |
|---|---|---|
| `user_id` | User.id | PK part |
| `category` | Category | PK part |
| `score` | float | Σ `value(e)` over the user's logs in this category (2.2) |

Updated whenever an Experience is created. Experiences are never edited or deleted. Everything else in section 2 is computed per request.

---

## 2. Algorithm

Notation: `u` is the viewer, `v` another user, `p` a Place, `e` an Experience.

### 2.1 Log value

Each Experience becomes a value in `[-1, 1]`:

```
value(e) = +1                    if verdict = recommend
         = −1                    if verdict = avoid
         = (rating − 3) / 2      if verdict = neutral      # 5★ → +1, 3★ → 0, 1★ → −1
```

A log is **liked** when `value(e) > 0`.

### 2.2 Taste profile

Each user has one score per category, stored in `TasteProfile`:

```
c_u[k] = Σ value(e) over u's logs in category k
```

It is updated when a log is created, never recomputed:

```
c_u[k] ← c_u[k] + value(e)      where k is the category of e's Place
```

Experiences are never edited or deleted, so this is the only update. A repeat visit to the same Place adds its value again.

A user who visits many cafés and likes them gets a large positive café score; avoided visits push a category negative. Categories a user never logged are 0.

Example:

| | trail | cafe | restaurant | museum |
|---|---|---|---|---|
| Viewer | 3.0 | 1.5 | −0.5 | 0 |
| Kai | 2.0 | 1.0 | 0 | 0.5 |
| Sam | 0 | 0 | 4.0 | 0 |

### 2.3 Similar users

```
taste_sim(u, v) = max( cosine(c_u, c_v), 0 )      # 0 if either vector is all zeros
```

Cosine compares the shape of two profiles, not their size, so a heavy logger and a light logger with the same preferences still match. In the example, Viewer–Kai ≈ 0.97 and Viewer–Sam = 0.

**Similar users** `N(u)` = the top 10 users `v` that `u` does not follow, with `taste_sim ≥ 0.2`. At demo scale this is a brute-force scan over all profiles; a vector index is listed in section 5.

**Limit:** with ~14 categories, users who like the same categories match even if they like different Places within them. Place overlap is the first thing to add back if matches feel too loose (section 5).

### 2.4 Author trust

```
trust(u, a) = 1              if u follows a
            = taste_sim(u,a) if a ∈ N(u)
            = 0              otherwise
```

### 2.5 Place score

For each Place `p` inside the request bbox that `u` has neither logged nor bookmarked:

```
score(p) = Σ over logs e at p:  trust(u, author_e) · value(e)
```

Keep Places with `score(p) > 0` and sort descending. A Place whose trusted logs are net negative is never recommended.

### 2.6 Filling the result

With `L = limit`:

1. **Main slots** (`round(0.8 · L)`): the top-scoring Places from 2.5.
2. **Explore slots** (the rest): random picks among Places in the bbox that have at least one liked log from anyone, excluding Places already picked and Places `u` logged or bookmarked. These are the "something new" pins and are still backed by a real log.
3. If either pool runs short, the other fills the remaining slots.

The random generator is seeded with `hash(user_id, current UTC date)` so results are stable within a day and reproducible in tests.

### 2.7 Cold start

A viewer who follows no one and has no logs has no trusted authors, so every slot is an explore slot. For this case only, explore picks are ordered by number of liked logs instead of random, so the best-liked Places in view show first.

### 2.8 Logs shown per Place

Each item carries up to 3 liked logs, ordered:

1. authors `u` follows,
2. then similar users by `taste_sim`,
3. then everyone else,

newest `visited_on` first within each group.

### 2.9 Item kind

| `kind` | Rule | Marker intent |
|---|---|---|
| `friend` | A followed user liked it | Recommended by people you follow |
| `similar_taste` | Main slot, no followed user liked it | Loved by people like you |
| `explore` | Filled an explore slot | Something new to you |

### 2.10 Constants

In `backend/app/recommend/config.py`.

| Constant | Default | Section |
|---|---|---|
| `PLACE_SIM_WEIGHT` / `CATEGORY_SIM_WEIGHT` | 0.5 / 0.5 | 2.2 |
| `SIMILAR_K` / `SIMILAR_MIN` | 10 / 0.2 | 2.2 |
| `EXPLORE_RATIO` | 0.2 | 2.5 |
| `LOGS_PER_PLACE` | 3 | 2.7 |

---

## 3. API

Routes live in `backend/app/routers/recommendations.py`. The viewer comes from a `get_current_user` dependency; until auth is chosen it reads an `X-Demo-User` header, enabled only in debug mode.

### 3.1 `GET /api/recommendations`

| Param | Type | Default | Validation |
|---|---|---|---|
| `bbox` | `min_lng,min_lat,max_lng,max_lat` | required | valid ranges, min < max |
| `limit` | int | 30 | 1–100 |

**Response `200`**

```json
{
  "items": [
    {
      "place": { "id": "p_42", "name": "Rouge Valley Trail", "lat": 43.81, "lng": -79.17, "category": "trail" },
      "kind": "friend",
      "score": 1.64,
      "logs": [
        {
          "experience_id": "e_301",
          "author": { "id": "u_maya", "display_name": "Maya", "avatar_url": null },
          "relation": "following",
          "rating": 5.0,
          "verdict": "recommend",
          "review": "Best fall colours in the city, go early.",
          "photo_urls": [],
          "visited_on": "2026-10-12"
        }
      ]
    }
  ]
}
```

`relation` is `following`, `similar_taste`, or `community` (anyone else). Explore items have `score: 0`.

**Errors:** `401` no viewer; `422` invalid parameters. An empty `items` list is a valid `200`.

### 3.2 `GET /api/places/{place_id}/logs`

All logs at a Place, for the panel when a pin is tapped, ordered as in 2.8 with non-liked logs after liked ones. Same log shape as 3.1. Response: `{ "items": [...] }`. `404` if the Place does not exist.

### 3.3 When the frontend calls it

| Trigger | Call |
|---|---|
| Map first load | `GET /recommendations` for the visible bbox |
| Map stops moving outside the fetched bbox | Same, debounced |
| Viewer logs, bookmarks, follows, or unfollows | Refetch the current bbox |
| Pin tapped | `GET /places/{id}/logs` |

---

## 4. Supporting components

### 4.1 Module layout

```
backend/app/
  models/                  Pydantic models for section 1
  repositories/
    base.py                Repository Protocol
    memory.py              in-memory implementation loaded from seed JSON
  recommend/
    config.py              constants (2.10)
    similarity.py          value(e), category vector, taste_sim, N(u)
    service.py             scoring, slots, log selection -> response
  routers/recommendations.py
backend/seed/              demo data (JSON)
```

`recommend/` functions take plain data; only `service.py` touches the repository.

### 4.2 Seed data

Shaped so every `kind` appears in the demo:

- ~60 Toronto Places across categories.
- ~10 persona users (hiker, foodie, gallery-goer, climber, café regular), 8–15 Experiences each.
- The demo viewer follows 3 users, shares liked Places with 1–2 non-followed users, and shares only categories (no Places) with at least one more.

### 4.3 Tests

- Unit tests for `value`, `place_sim`, `category_sim`, `taste_sim` with hand-built fixtures, including the case of two users with no shared Places but the same category profile.
- Invariants over the seed data:
  - every item has at least one liked log;
  - no item is a Place the viewer logged or bookmarked;
  - same viewer and date give the same output.
- Router tests for `422` cases.

---

## 5. Later (add only when needed)

| Addition | Add when |
|---|---|
| Normalise ratings by each author's average | Real users rate on visibly different scales |
| Recency decay on logs | Logs span many months |
| Category match and distance in the place score | Results feel off-topic or too far away |
| Onboarding categories and bookmarks in the category vector | New users get weak matches |
| Thompson sampling for explore picks | Random explore picks feel like noise |
| Category diversity re-ranking (MMR) | One category dominates the map |
| `mode=explore` ("Surprise me"), `categories` filter, `seed` param | A UI needs them |
| Pagination on place logs, cached similarity | Data outgrows a single in-memory request |
| `followers`-only log visibility | Users ask for private logs |

## 6. Open questions

- Final rating scale (affects 2.1 only).
- Whether a viewer can hide a specific stranger from their recommendations.
