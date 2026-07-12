# Fishdex — Caribbean Fish Dashboard

iNaturalist-powered dashboard for tracking Caribbean reef fish observations.

## Setup

1. Copy `.env.example` to `.env` and set your iNaturalist username:

   ```bash
   cp .env.example .env
   # Edit .env to set VITE_INATURALIST_USERNAME=your_inaturalist_username
   ```

2. Install dependencies and start the dev server:
   ```bash
   bun install
   bun run dev
   ```

## Data Pipeline

Only **one live API call** per page load: fetching the configured user's observations. All other data is git-tracked and loaded from a static JSON file at build time.

| File                              | Source                                                                                       | Live API? |
| --------------------------------- | -------------------------------------------------------------------------------------------- | --------- |
| `src/data/caribbean-species.json` | iNaturalist species_counts (research-grade, Caribbean marine species across multiple groups) | No        |
| User observations                 | `GET /v1/observations?user_login={VITE_INATURALIST_USERNAME}`                                | Yes       |

## Rarity

Rarity is based on Caribbean observation count thresholds:

| Tier      | Threshold   | Description              |
| --------- | ----------- | ------------------------ |
| Common    | >= 500 obs  | Most frequently observed |
| Uncommon  | >= 50 obs   | Regularly observed       |
| Rare      | >= 5 obs    | Infrequently observed    |
| Legendary | < 5 obs     | Very rarely observed     |

## Refreshing

```bash
python3 scripts/refresh-caribbean.py
```

Fetches all Caribbean fish species from iNaturalist and assigns percentile-based rarity. Takes ~30 seconds.

Edit `scripts/boxes.json` to customize which geographic regions are queried. Copy `scripts/boxes.example.json` to `scripts/boxes.json` to get started. Each entry needs `name`, `nelat`, `nelng`, `swlat`, `swlng`. The script merges species counts across all boxes.

After running:

```bash
git add src/data/ && git commit -m "refresh iNat Caribbean data"
```

Run monthly to keep rarity percentiles current.

## Architecture

- **`src/lib/inaturalist.ts`** — API client (types, fetch helpers)
- **`src/hooks/use-inaturalist.ts`** — React Query hooks, loads JSON at build time
- **`src/routes/index.tsx`** — Dashboard UI with Seen / Find tabs
- **`src/data/caribbean-species.json`** — All Caribbean marine species
- **`scripts/refresh-caribbean.py`** — Regenerate species data
- **`scripts/boxes.json`** — Geographic bounding boxes for species queries
