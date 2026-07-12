#!/usr/bin/env python3
"""
POC: Fetch marine life size data from Wikidata (structured) + iNaturalist
wikipedia_summary (strict regex fallback).

Wikidata approach: query all taxa that have both P2043 (length) and P3151
(iNaturalist taxon ID), then cross-reference with our Caribbean species list.

iNaturalist fallback: for species not covered by Wikidata, fetch the taxon
endpoint and extract size from wikipedia_summary using strict regex patterns
(no NLP, no heuristics).
"""
import json
import re
import time
import urllib.request
import urllib.parse
from pathlib import Path

CARIBBEAN_JSON = Path(__file__).parent.parent / "src" / "data" / "caribbean-species.json"
WIKIDATA_SPARQL = "https://query.wikidata.org/sparql"
INAT_TAXON = "https://api.inaturalist.org/v1/taxa"
HEADERS = {"User-Agent": "Fishdex-size-poc/1.0"}


# ---- Wikidata -----------------------------------------------------------
def fetch_wikidata_sizes(limit=500):
    """Fetch all taxa with P2043 (length) + P3151 (iNat ID) from Wikidata."""
    query = f"""
    SELECT ?iNatId ?itemLabel ?length WHERE {{
      ?item wdt:P2043 ?length;
            wdt:P3151 ?iNatId.
      SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }}
    }}
    LIMIT {limit}
    """
    params = urllib.parse.urlencode({"format": "json", "query": query})
    url = f"{WIKIDATA_SPARQL}?{params}"
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read())

    results = {}
    for binding in data["results"]["bindings"]:
        inat_id = int(binding["iNatId"]["value"])
        label = binding.get("itemLabel", {}).get("value", "")
        length_m = float(binding["length"]["value"])
        length_cm = round(length_m * 100, 1)
        # Keep the largest value if duplicate iNat IDs exist
        if inat_id not in results or length_cm > results[inat_id][0]:
            results[inat_id] = (length_cm, label, "wikidata")
    return results


# ---- iNaturalist wikipedia_summary --------------------------------------
# Strict patterns — only match when the text clearly states a length.
# Pattern groups are in order of specificity; first match wins.
SIZE_PATTERNS = [
    # "maximum length of about 22.9 centimetres (9.0 in)" etc.
    (
        re.compile(
            r"(?:maximum|max|total)\s+length\s+(?:of\s+)?(?:about\s+)?(\d+\.?\d*)\s*(?:centimetres?|cm)\s*\(\s*\d+\.?\d*\s*(?:in|inches?)\s*\)",
            re.IGNORECASE,
        ),
        "cm",
    ),
    # "...reaching up to 35.2 centimetres (13.9 in) in shell length"
    (
        re.compile(
            r"up\s+to\s+(\d+\.?\d*)\s*(?:centimetres?|cm)\s*\(\s*\d+\.?\d*\s*(?:in|inches?)\s*\)",
            re.IGNORECASE,
        ),
        "cm",
    ),
    # "grows to ... length of about X cm"
    (
        re.compile(
            r"grows?\s+to\s+(?:a\s+)?(?:maximum\s+)?length\s+of\s+(?:about\s+)?(\d+\.?\d*)\s*(?:centimetres?|cm)",
            re.IGNORECASE,
        ),
        "cm",
    ),
    # "can reach a length of about 1.1 m"
    (
        re.compile(
            r"(?:can\s+reach|reaches?)\s+(?:a\s+)?(?:maximum\s+)?length\s+of\s+(?:about\s+)?(\d+\.?\d*)\s*m\b",
            re.IGNORECASE,
        ),
        "m",
    ),
    # "mantle ... up to 60 cm long"
    (
        re.compile(
            r"mantle\s+(?:is\s+)?(?:large\s+and\s+chunky\s+in\s+comparison\s+)?(?:\(\s*)?up\s+to\s+(\d+\.?\d*)\s*(?:centimetres?|cm)(?:\s+long)?(?:\s*\))?",
            re.IGNORECASE,
        ),
        "cm",
    ),
    # "...reaches a body length of X centimetres (Y in)"
    (
        re.compile(
            r"body\s+length\s+of\s+(\d+\.?\d*)\s*(?:centimetres?|cm)\s*\(\s*\d+\.?\d*\s*(?:in|inches?)\s*\)",
            re.IGNORECASE,
        ),
        "cm",
    ),
    # "shell length up to X cm"
    (
        re.compile(
            r"shell\s+length\s+(?:of\s+)?(?:up\s+to\s+)?(\d+\.?\d*)\s*(?:centimetres?|cm)",
            re.IGNORECASE,
        ),
        "cm",
    ),
    # "...average length of X cm"
    (
        re.compile(
            r"average\s+length\s+of\s+(?:about\s+)?(\d+\.?\d*)\s*(?:centimetres?|cm)",
            re.IGNORECASE,
        ),
        "cm",
    ),
    # Carapace patterns for turtles/crustaceans
    (
        re.compile(
            r"carapace\s+(?:length\s+(?:of\s+)?)?(?:up\s+to\s+)?(\d+\.?\d*)\s*(?:centimetres?|cm)",
            re.IGNORECASE,
        ),
        "cm",
    ),
]


def extract_size_from_summary(summary):
    """Extract max length (cm) from wikipedia_summary using strict regex."""
    if not summary:
        return None, None
    for pattern, unit in SIZE_PATTERNS:
        match = pattern.search(summary)
        if match:
            value = float(match.group(1))
            if unit == "m":
                value *= 100
            return round(value, 1), unit
    return None, None


def fetch_inat_taxon(taxon_id):
    """Fetch taxon data and extract size from wikipedia_summary."""
    url = f"{INAT_TAXON}/{taxon_id}"
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read())
        if data.get("results"):
            summary = data["results"][0].get("wikipedia_summary")
            length_cm, unit = extract_size_from_summary(summary)
            if length_cm is not None:
                name = data["results"][0].get("preferred_common_name", "")
                return length_cm, name, f"inat_summary ({unit})"
    except Exception as e:
        print(f"    iNat fetch error for taxon {taxon_id}: {e}")
    return None, None, None


# ---- Main ---------------------------------------------------------------
def main():
    # 1. Load Caribbean species
    with open(CARIBBEAN_JSON) as f:
        species = json.load(f)
    print(f"Caribbean species total: {len(species)}")

    # 2. Fetch Wikidata sizes
    print("\n--- Wikidata SPARQL ---")
    print("Fetching all taxa with P2043 (length) + P3151 (iNat ID)...")
    wd_sizes = fetch_wikidata_sizes(limit=500)
    print(f"  Wikidata returned {len(wd_sizes)} taxa with length data")

    # Cross-reference with our species
    wd_hits = {s["taxonId"]: wd_sizes[s["taxonId"]] for s in species if s["taxonId"] in wd_sizes}
    print(f"  Caribbean species covered by Wikidata: {len(wd_hits)} / {len(species)}")
    if wd_hits:
        print("  Sample:")
        for tid, (cm, name, _) in list(wd_hits.items())[:10]:
            print(f"    {name:35s} {cm:>7.1f} cm  (iNat taxon {tid})")

    # 3. iNaturalist wikipedia_summary fallback
    print("\n--- iNaturalist wikipedia_summary fallback ---")
    uncovered = [s for s in species if s["taxonId"] not in wd_hits]

    # Pick a sample across groups
    import random
    random.seed(42)
    sample = {}
    for group in ["fish", "elasmobranch", "turtle", "crustacean", "cephalopod", "gastropod"]:
        group_sp = [s for s in uncovered if s["group"] == group]
        sample_size = min(5, len(group_sp))
        for s in random.sample(group_sp, sample_size):
            sample[s["taxonId"]] = s

    print(f"Testing {len(sample)} uncovered species across all groups...")
    inat_hits = {}
    for tid, sp in sample.items():
        length_cm, name, source = fetch_inat_taxon(tid)
        if length_cm is not None:
            inat_hits[tid] = (length_cm, name or sp["scientificName"], source)
            print(f"  HIT:  {sp['scientificName']:40s} {length_cm:>7.1f} cm ({source})")
        else:
            print(f"  MISS: {sp['scientificName']}")
        time.sleep(0.5)  # Rate limit

    print(f"\n  iNat summary hits in sample: {len(inat_hits)} / {len(sample)}")

    # 4. Extrapolate coverage
    combined = {**wd_hits, **inat_hits}
    print(f"\n--- Combined (sample extrapolation) ---")
    print(f"  Wikidata:       {len(wd_hits)} / {len(species)} ({100*len(wd_hits)/len(species):.1f}%)")
    inat_extrapolated = int(len(inat_hits) / len(sample) * len(uncovered)) if sample else 0
    estimated_combined = len(wd_hits) + inat_extrapolated
    print(f"  + iNat summary:  ~{inat_extrapolated} (estimated from {len(inat_hits)}/{len(sample)} sample hits)")
    print(f"  Estimated total: ~{estimated_combined} / {len(species)} ({100*estimated_combined/len(species):.1f}%)")

    # 5. Show all Wikidata hits by group
    print("\n--- Wikidata hits by group ---")
    by_group = {}
    for s in species:
        if s["taxonId"] in wd_hits:
            by_group.setdefault(s["group"], []).append((s, wd_hits[s["taxonId"]]))
    for group in ["fish", "elasmobranch", "turtle", "crustacean", "cephalopod", "gastropod"]:
        items = by_group.get(group, [])
        print(f"\n  {group} ({len(items)}):")
        for sp, (cm, wd_name, _) in items:
            print(f"    {sp['scientificName']:40s} {cm:>7.1f} cm  ({wd_name})")


if __name__ == "__main__":
    main()
