# Fishdex — Caribbean Fish Dashboard

iNaturalist-powered dashboard for tracking Caribbean reef fish observations.

## Data Pipeline

Only **one live API call** per page load: fetching `jwaltrip`'s observations. All other data is git-tracked and loaded from a static JSON file at build time.

| File | Source | Live API? |
|---|---|---|
| `src/data/caribbean-species.json` | iNaturalist species_counts (research-grade, all 1,306 Caribbean fish species) | No |
| User observations | `GET /v1/observations?user_login=jwaltrip` | Yes |

## Rarity

Rarity is **percentile-based** on Caribbean observation counts — reflecting how often a species is seen in the Caribbean:

| Tier | Percentile | Description |
|---|---|---|
| Common | Top 20% | Most frequently observed |
| Uncommon | 20–50% | Regularly observed |
| Rare | 50–80% | Infrequently observed |
| Legendary | Bottom 20% | Very rarely observed |

## Refreshing

```bash
python3 scripts/refresh-caribbean.py
```

Fetches all Caribbean fish species from iNaturalist and assigns percentile-based rarity. Takes ~30 seconds.

After running:

```bash
git add src/data/ && git commit -m "refresh iNat Caribbean data"
```

Run monthly to keep rarity percentiles current.

## Architecture

- **`src/lib/inaturalist.ts`** — API client (types, fetch helpers)
- **`src/hooks/use-inaturalist.ts`** — React Query hooks, loads JSON at build time
- **`src/routes/index.tsx`** — Dashboard UI with Seen / Find tabs
- **`src/data/caribbean-species.json`** — All 1,703 Caribbean fish species
- **`scripts/refresh-caribbean.py`** — Regenerate species data
