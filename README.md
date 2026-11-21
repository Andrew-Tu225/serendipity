# Serendipity

**Discover the world through the experiences of people you trust.**

Serendipity is a map-first social discovery app: Letterboxd for real-world places. Instead of ranking places by thousands of stranger reviews, your map is shaped by what your friends have visited, reviewed, and recommended.

Built for a hackathon on the theme **Discovering the Unknown**: not undiscovered places, but places that are unknown *to you*, like the café two streets over or the trail a friend loves.

## What it does

- **Social map**: an interactive map where markers show places friends recommended, places friends reviewed, places you bookmarked, and possible hidden gems.
- **Experiences**: log a visit to any place (restaurant, trail, climbing gym, museum, viewpoint) with a rating, a written review, photos, and whether you'd recommend it.
- **Friends**: see the places your friends have been and what they thought, both good and bad.
- **Bookmarks**: save a place the moment someone mentions it, so recommendations stop getting lost in DMs and notes apps.

The core loop: **Discover → Save → Experience → Review → Share → someone else discovers.**

The full concept, user story, and open design questions are in [docs/plan.md](docs/plan.md).

## Tech stack

- [Next.js 16](https://nextjs.org) (App Router, Turbopack) with React 19 and TypeScript
- [Tailwind CSS v4](https://tailwindcss.com)
- ESLint 9

Map library, database, auth, and image storage are still to be decided.

## Getting started

Requires Node.js 20.9 or later.

```bash
npm install
cp .env.example .env.local   # fill in any values
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | Run ESLint |

## Project structure

```
docs/               product plan and design notes
src/app/            routes and layouts (App Router)
src/components/     feature components; ui/ for generic primitives
src/hooks/          client hooks
src/lib/            helpers and service clients
src/types/          shared domain types (Place, Experience, Bookmark, ...)
```

## Contributing

Conventions for humans and AI coding agents live in [AGENTS.md](AGENTS.md) (read by Claude Code through [CLAUDE.md](CLAUDE.md)). Commit messages follow `<type>: <description>`, for example `feat: add bookmark toggle`.
