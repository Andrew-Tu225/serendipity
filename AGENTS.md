<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Serendipity

A map-first social discovery app for a hackathon (theme: "Discovering the Unknown"). Users log experiences at real-world places (rating, review, photos), bookmark places to visit later, and explore a map shaped by what their friends have reviewed and recommended, rather than by stranger ratings. Think Letterboxd for places, built around an interactive map.

Full product concept and open questions: [docs/plan.md](docs/plan.md). Read it before making product or data-model decisions.

## Core loop

Discover → Save → Experience → Review → Share → someone else discovers.

Every feature should serve that loop. The map is the primary surface; a feed or list view is secondary.

## Domain vocabulary

Use these names consistently in code, routes, and the database.

| Term | Meaning |
|------|---------|
| Place | A real-world location on the map: restaurant, trail, gym, museum, viewpoint, anything. Not limited to businesses. |
| Experience | One user's log of a visit to a Place: rating, written review, photos, recommend/avoid. |
| Bookmark | A user saving a Place to visit later, whether or not they have been there. |
| Friend | A social connection whose Experiences shape the user's map. Mutual vs. follow is undecided (see plan §8). |

Map markers distinguish a Place's relationship to the viewer: recommended by friends, reviewed by friends, bookmarked by the viewer, or a possible hidden gem.

## Stack

- Next.js 16 (App Router, Turbopack), React 19, TypeScript (strict)
- Tailwind CSS v4 (configured in `src/app/globals.css`, no `tailwind.config`)
- ESLint 9 via `eslint-config-next`
- Not chosen yet: map library, database/backend, auth, image storage. Do not add one without confirming with the team; record the choice here once made.

## Layout

```
docs/               product plan and design notes
src/app/            routes, layouts, route handlers (App Router)
src/components/     feature components; src/components/ui/ for generic primitives
src/hooks/          client hooks (use* prefix)
src/lib/            framework-agnostic helpers and service clients
src/types/          shared domain types (Place, Experience, Bookmark, ...)
```

Group feature code by domain (`components/map/`, `components/experience/`) rather than by file type. Import from `src` via the `@/` alias.

## Commands

```bash
npm run dev     # http://localhost:3000
npm run build   # production build; must pass before merging
npm run lint
```

## Conventions

- Server Components by default; add `"use client"` only for interactivity (the map, forms, bookmark toggles).
- Secrets go in `.env.local` (git-ignored). Document every variable in `.env.example`. Only `NEXT_PUBLIC_*` values reach the browser; map tile keys may be public, database keys must not be.
- Validate user input (reviews, ratings, uploads, coordinates) at the server boundary.
- Commit messages: `<type>: <description>` with types feat, fix, refactor, docs, test, chore, perf, ci.
- Hackathon scope: ship the core loop end to end before polishing any single feature. Prefer seeded demo data (e.g. Toronto places and a few fake friends) over building features the demo will not show.
