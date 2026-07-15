#!/usr/bin/env python3
"""
FishBase scraper: extract max length (cm) for Caribbean fish/elasmobranch species.

- Caches structured results to JSON (safe to interrupt/resume)
- Saves full HTML pages to scripts/fishbase-pages/ for future data mining
- On re-runs, skips network fetch if cached JSON entry OR HTML file exists
- URL pattern: https://fishbase.de/summary/{Genus}-{species}.html
"""
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

CARIBBEAN_JSON = Path(__file__).parent.parent / "src" / "data" / "caribbean-species.json"
CACHE_FILE = Path(__file__).parent.parent / "src" / "data" / "fishbase-sizes.json"
PAGES_DIR = Path(__file__).parent / "fishbase-pages"
HEADERS = {"User-Agent": "Fishdex/1.0"}
FISHBASE_BASE = "https://fishbase.de/summary"
MAX_LEN_RE = re.compile(r"Max length\s*:\s*([\d,]+\.?\d*)\s*cm", re.IGNORECASE)
DELAY_S = 0.35


def load_cache():
    if CACHE_FILE.exists():
        with open(CACHE_FILE) as f:
            return json.load(f)
    return {}


def save_cache(cache):
    cache["_updated"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    with open(CACHE_FILE, "w") as f:
        json.dump(cache, f, indent=2)


def url_for_name(name):
    parts = name.split()
    if len(parts) < 2:
        return f"{FISHBASE_BASE}/{name}.html"
    return f"{FISHBASE_BASE}/{parts[0]}-{parts[1]}.html"


def fetch_html(name, taxon_id):
    html_path = PAGES_DIR / f"{taxon_id}.html"

    if html_path.exists():
        with open(html_path) as f:
            return f.read()

    url = url_for_name(name)
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            html = resp.read().decode("utf-8", errors="replace")
    except Exception:
        return None

    PAGES_DIR.mkdir(parents=True, exist_ok=True)
    with open(html_path, "w") as f:
        f.write(html)

    return html


def fetch_max_length(name, taxon_id):
    html = fetch_html(name, taxon_id)
    if not html:
        return None
    match = MAX_LEN_RE.search(html)
    if match:
        return float(match.group(1).replace(",", ""))
    return None


def main():
    with open(CARIBBEAN_JSON) as f:
        all_species = json.load(f)

    cache = load_cache()
    target = [s for s in all_species if s["group"] in ("fish", "elasmobranch")]
    total = len(target)

    # Count already-cached
    already = sum(1 for s in target if str(s["taxonId"]) in cache)
    remaining = total - already
    print(f"Total species: {total}  |  cached: {already}  |  to fetch: {remaining}")
    print()

    fetched, hits, misses = 0, 0, 0
    t_start = time.time()

    for i, sp in enumerate(target):
        tid = str(sp["taxonId"])
        name = sp["scientificName"]

        # Skip if cached
        if tid in cache:
            continue

        length = fetch_max_length(name, tid)
        fetched += 1

        if length is not None:
            cache[tid] = {
                "scientificName": name,
                "commonName": sp.get("commonName", ""),
                "maxLengthCm": length,
                "group": sp["group"],
            }
            hits += 1
            marker = "+"
        else:
            cache[tid] = None  # negative cache — don't retry
            misses += 1
            marker = "-"

        # Progress: every species, with ETA
        elapsed = time.time() - t_start
        rate = fetched / elapsed if elapsed > 0 else 0
        eta = (remaining - fetched) / rate if rate > 0 else 0
        pct = (already + fetched) / total * 100
        size_info = f"{length:.1f} cm" if length else ""
        sys.stdout.write(
            f"\r  [{already + fetched}/{total}] {pct:5.1f}%  {marker}  {name:45s} {size_info:>10s}  "
            f"({fetched}/{remaining} done, ~{eta:.0f}s left)"
        )
        sys.stdout.flush()

        # Save cache periodically (every 10 fetches)
        if fetched % 10 == 0:
            save_cache(cache)

        time.sleep(DELAY_S)

    # Final save
    save_cache(cache)

    # Strip nulls for summary
    real_results = {k: v for k, v in cache.items() if v is not None and not k.startswith("_")}
    results = {int(k): v for k, v in real_results.items()}

    print("\n\nDone.")
    print(f"Coverage: {len(results)}/{total} ({100*len(results)/total:.1f}%)")
    print(f"Cache saved to {CACHE_FILE}")

    # Top 10 largest/smallest
    by_size = sorted(results.values(), key=lambda x: x["maxLengthCm"])
    print("\nSmallest:")
    for sp in by_size[:5]:
        print(f"  {sp['scientificName']:45s} {sp['maxLengthCm']:>8.1f} cm  ({sp['commonName']})")
    print("Largest:")
    for sp in by_size[-5:]:
        print(f"  {sp['scientificName']:45s} {sp['maxLengthCm']:>8.1f} cm  ({sp['commonName']})")

    # By rarity
    print("\nCoverage by rarity:")
    for r in ["common", "uncommon", "rare", "legendary"]:
        group_total = len([s for s in target if s["rarity"] == r])
        group_hits = sum(1 for s in target if s["rarity"] == r and int(s["taxonId"]) in results)
        if group_total:
            print(f"  {r:10s}: {group_hits}/{group_total} ({100*group_hits/group_total:.0f}%)")
        else:
            print(f"  {r:10s}: 0")


if __name__ == "__main__":
    main()
