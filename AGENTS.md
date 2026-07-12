<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

# Fishdex (Reef Recall)

A Pokédex-style dashboard for Caribbean reef fish observations. Pulls live observation data from the [iNaturalist API](https://api.inaturalist.org/) for user `jwaltrip` and presents a searchable, filterable grid of ~1,700 Caribbean marine species grouped by rarity tier (Common, Uncommon, Rare, Legendary based on observation counts) and taxonomic group.

## Tech Stack

- **Framework**: [TanStack Start](https://tanstack.com/start) v1.x (file-based SSR routing)
- **Router**: [@tanstack/react-router](https://tanstack.com/router) v1.x
- **Data Fetching**: [@tanstack/react-query](https://tanstack.com/query) v5.x
- **Runtime**: Bun (primary), Node.js 22 (via devenv)
- **Build**: Vite v8.x via `@lovable.dev/vite-tanstack-config`
- **Server**: Nitro v3 (builds to Cloudflare Workers)
- **Language**: TypeScript v5.8 (strict mode)
- **UI**: React v19 + shadcn/ui (new-york style) + Tailwind CSS v4
- **Forms**: react-hook-form + zod
- **Charts**: recharts
- **Linting**: ESLint v9 (flat config)
- **Formatting**: Prettier v3 (100 char width, semicolons, double quotes, trailing commas)
- **Dev Environment**: devenv (Nix-based reproducible shell)

## Key Files

| Path                                 | Purpose                                                               |
| ------------------------------------ | --------------------------------------------------------------------- |
| `src/routes/index.tsx` (~1100 lines) | Main dashboard: grid, filters, species detail dialogs                 |
| `src/routes/__root.tsx`              | Root route with HTML shell, 404, error boundaries                     |
| `src/lib/inaturalist.ts`             | iNaturalist API client (types, fetch helpers, pagination)             |
| `src/hooks/use-inaturalist.ts`       | React Query hooks for observed/missing species                        |
| `src/hooks/use-observed-fish.ts`     | Legacy localStorage-based observation tracking                        |
| `src/data/caribbean-species.json`    | ~1,700 Caribbean marine species with metadata                         |
| `src/data/fishbase-sizes.json`       | Max length (cm) from FishBase scraper                                 |
| `src/server.ts`                      | SSR entry with h3 error capture                                       |
| `scripts/refresh-caribbean.py`       | Main data pipeline: fetches species counts from iNaturalist           |
| `vite.config.ts`                     | Vite config — do NOT add plugins manually (handled by Lovable config) |

## Commands

```bash
bun install          # install dependencies
bun run dev          # start dev server
bun run build        # production build
bun run build:dev    # dev mode build
bun run preview      # preview production build
bun run lint         # ESLint
bun run format       # Prettier

# Data pipeline (requires Python 3)
python3 scripts/refresh-caribbean.py     # refresh species data (~30s)
python3 scripts/fishbase_scraper_poc.py  # scrape max lengths from FishBase
```

## Conventions

- File-based routing in `src/routes/` — the route tree is auto-generated in `src/routeTree.gen.ts` (do not edit)
- Path alias `@/` maps to `./src/`
- Use shadcn/ui components from `src/components/ui/` — new-york style
- No database — all data is git-tracked JSON or live API calls
- No automated tests configured yet
- `@lovable.dev/vite-tanstack-config` manages all Vite plugins — do not add plugins directly to `vite.config.ts`
