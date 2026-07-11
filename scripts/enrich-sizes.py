#!/usr/bin/env python3
"""
Enrich caribbean-species.json with maxLengthCm from Wikipedia,
using iNaturalist's wikipedia_url as the bridge.

- Checks iNat taxon API for wikipedia_url per species
- Fetches full Wikipedia article via extracts API
- Extracts max length from all cm/m/ft/in values, scored by proximity
  to length-related terms
- Respects Wikipedia's 200 req/min rate limit for User-Agent bots
"""
import json, urllib.request, urllib.parse, time, os, re, sys

OUT = os.path.join(os.path.dirname(__file__), "..", "src", "data", "caribbean-species.json")
INAT_API = "https://api.inaturalist.org/v1/taxa"
WIKI_API = "https://en.wikipedia.org/w/api.php"
UA = "Fishdex/1.0 (https://github.com/jwaltrip/fishdex; fishdex@example.com)"

DELAY_INAT = 0.35   # ~170 req/min for iNat (no hard limit documented)
DELAY_WIKI = 0.35   # ~170 req/min, well under 200/min limit

LENGTH_TERMS = re.compile(
    r"(?:max\w*|total|fork|standard|body|carapace|mantle|disc|dorsal)\s*"
    r"(?:length|size|width)|"
    r"(?:grows?|reaches?|attains?|maximum|max|up to|length|size|long)",
    re.IGNORECASE,
)


def fetch_wikipedia_url(taxon_id: int) -> str | None:
    try:
        req = urllib.request.Request(f"{INAT_API}/{taxon_id}", headers={"User-Agent": UA})
        data = json.loads(urllib.request.urlopen(req, timeout=10).read())
        return data["results"][0].get("wikipedia_url")
    except Exception:
        return None


def wiki_page_from_url(url: str) -> str | None:
    m = re.search(r"/wiki/(.+?)(?:[?#]|$)", url)
    if not m:
        return None
    return urllib.parse.unquote(m.group(1))


def fetch_extract(page: str) -> str | None:
    params = urllib.parse.urlencode({
        "action": "query", "titles": page,
        "prop": "extracts", "explaintext": "1",
        "format": "json",
    })
    req = urllib.request.Request(f"{WIKI_API}?{params}", headers={"User-Agent": UA})
    for attempt in range(3):
        try:
            data = json.loads(urllib.request.urlopen(req, timeout=10).read())
            for pid, pdata in data.get("query", {}).get("pages", {}).items():
                if pid == "-1":
                    return None
                return pdata.get("extract", "")
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait = int(e.headers.get("Retry-After", "30"))
                print(f"    Rate limited, waiting {wait}s...")
                time.sleep(wait)
            else:
                return None
        except Exception:
            return None
    return None


def extract_max_length_cm(text: str) -> float | None:
    """
    Extract maximum length from Wikipedia article text.
    1. Finds all (value, unit) pairs with relevant units
    2. Scores each by proximity to length-related terms
    3. Returns the highest plausible value in cm
    """
    UnitConversions = {
        "cm": 1, "centimetres": 1, "centimeters": 1,
        "m": 100, "metres": 100, "meters": 100,
        "ft": 30.48, "feet": 30.48,
        "in": 2.54, "inches": 2.54,
        "mm": 0.1, "millimetres": 0.1, "millimeters": 0.1,
    }

    candidates = []

    for m in re.finditer(
        r"([\d,.]+)\s*(cm|centimet[re]?|centimeters?|"
        r"m|met[re]?|meters?|ft|feet|in|inches?|"
        r"mm|millimet[re]?|millimeters?)",
        text[:15000],
        re.IGNORECASE,
    ):
        unit = m.group(2).lower().rstrip("s")
        factor = UnitConversions.get(unit)
        if factor is None:
            continue

        try:
            raw_val = float(m.group(1).replace(",", ""))
        except ValueError:
            continue

        val_cm = raw_val * factor
        if not (0.3 < val_cm < 2500):
            continue

        # Score by proximity to length terms
        prefix = text[max(0, m.start() - 200): m.start()]
        score = 0
        if LENGTH_TERMS.search(prefix):
            score += 2
        # Bonus if the value is in the Description section
        desc_idx = text.lower().find("description")
        if desc_idx >= 0 and desc_idx < m.start():
            score += 1

        candidates.append((score, val_cm))

    if not candidates:
        return None

    # Sort by score descending, then by value descending
    candidates.sort(key=lambda x: (-x[0], -x[1]))

    # Take top-scoring values and pick the maximum among them
    best_score = candidates[0][0]
    top = [v for s, v in candidates if s == best_score]
    return round(max(top), 1)


def enrich():
    with open(OUT) as f:
        species_list = json.load(f)

    already = sum(1 for s in species_list if s.get("maxLengthCm"))
    new_count = 0
    no_wiki = 0
    no_data = 0
    errors = 0
    total = len(species_list)

    print(f"Loaded {total} species ({already} already enriched)\n")

    for i, sp in enumerate(species_list):
        if sp.get("maxLengthCm"):
            continue

        tid = sp["taxonId"]
        prog = f"[{i+1}/{total}]"

        wp_url = fetch_wikipedia_url(tid)
        time.sleep(DELAY_INAT)

        if not wp_url:
            no_wiki += 1
            if no_wiki <= 3 or no_wiki % 100 == 0:
                print(f"  {prog} {sp['scientificName']}: no Wikipedia link")
            continue

        page = wiki_page_from_url(wp_url)
        if not page:
            no_wiki += 1
            continue

        extract = fetch_extract(page)
        time.sleep(DELAY_WIKI)

        if not extract:
            errors += 1
            if errors <= 3:
                print(f"  {prog} {sp['scientificName']}: failed to fetch '{page}'")
            continue

        val = extract_max_length_cm(extract)
        if val is not None:
            sp["maxLengthCm"] = val
            new_count += 1
            label = f"{val:.1f} cm"
            print(f"  {prog} {sp['scientificName']}: {label} ✓")
        else:
            no_data += 1
            if no_data <= 5 or no_data % 50 == 0:
                print(f"  {prog} {sp['scientificName']}: no size data on page")

        if (i + 1) % 100 == 0:
            with open(OUT, "w") as f:
                json.dump(species_list, f, indent=2)
            print(f"  --- saved at {i+1}/{total} "
                  f"(+{new_count} new, {no_wiki} no wiki, {no_data} no data, {errors} errors) ---")

    with open(OUT, "w") as f:
        json.dump(species_list, f, indent=2)

    print(f"\nDone. {already + new_count} of {total} species have size data (+{new_count})")
    print(f"  No Wikipedia link: {no_wiki}")
    print(f"  Page exists but no size extracted: {no_data}")
    print(f"  Fetch errors: {errors}")


if __name__ == "__main__":
    enrich()
