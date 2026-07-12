#!/usr/bin/env python3
"""
Refresh caribbean-species.json from iNaturalist API.

Bounding boxes are loaded from scripts/boxes.json (copy boxes.example.json
to boxes.json to get started). Each entry should have:
  name, nelat, nelng, swlat, swlng

Edit boxes.json to add or remove regions. The script merges counts across
all boxes for each species.

Rarity thresholds are based on raw observation frequency:

  Common:     obs >= 500
  Uncommon:   obs >= 50
  Rare:       obs >= 5
  Legendary:  obs < 5
"""
import json, urllib.request, urllib.parse, time, os

OUT = os.path.join(os.path.dirname(__file__), "..", "src", "data", "caribbean-species.json")
BOXES_PATH = os.path.join(os.path.dirname(__file__), "boxes.json")
BOXES_EXAMPLE_PATH = os.path.join(os.path.dirname(__file__), "boxes.example.json")

PER_PAGE = 500

GROUPS = [
    (47178, "fish", "Ray-finned fish"),
    (47273, "elasmobranch", "Sharks & rays"),
    (39657, "turtle", "Sea turtles (Cheloniidae)"),
    (39576, "turtle", "Sea turtles (Dermochelyidae)"),
    (47186, "crustacean", "Crabs, lobsters & shrimp"),
    (47459, "cephalopod", "Octopus & squid"),
    (62602, "gastropod", "Conch & allies"),
]

LAND_CRAB_COMMON = {
    "land crab",
    "land hermit crab",
    "ghost crab",
    "mangrove crab",
    "mangrove tree crab",
    "mangrove root crab",
    "mangrove ghost crab",
    "sand crab",
    "mole crab",
    "marsh crab",
    "fiddler crab",
    "nipper",
}


def is_land_crab(species):
    """Return True if the species is a land/terrestrial crab."""
    if species["group"] != "crustacean":
        return False
    common = (species.get("commonName") or "").lower()
    if any(kw in common for kw in LAND_CRAB_COMMON):
        return True
    # Check if the iNat API returned family-level ancestor IDs (not available
    # in species_counts endpoint, so this is a supplemental check via name).
    for kw in ("Coenobita", "Cardisoma", "Gecarcinus", "Ocypode",
               "Hartnollius", "Aratus", "Goniopsis", "Geograpsus",
               "Minuca", "Ucides", "Armases", "Leptuca", "Albunea",
               "Emerita", "Hippa"):
        if kw.lower() in (species.get("scientificName") or "").lower():
            return True
    return False


def fetch_box(taxon_id, bbox):
    species = {}
    page = 1
    while True:
        params = urllib.parse.urlencode({
            "nelat": bbox["nelat"], "nelng": bbox["nelng"],
            "swlat": bbox["swlat"], "swlng": bbox["swlng"],
            "taxon_id": taxon_id, "quality_grade": "research",
            "per_page": PER_PAGE, "page": page,
        })
        url = f"https://api.inaturalist.org/v1/observations/species_counts?{params}"
        req = urllib.request.Request(url, headers={"User-Agent": "Fishdex/1.0"})
        data = json.loads(urllib.request.urlopen(req).read())

        for r in data["results"]:
            t = r["taxon"]
            photo = t.get("default_photo", {})
            species[t["id"]] = {
                "taxonId": t["id"],
                "scientificName": t["name"],
                "commonName": t.get("preferred_common_name", ""),
                "caribbeanObsCount": r["count"],
                "rarity": "legendary",  # placeholder
                "group": "",  # filled after merge
                "photoUrl": photo.get("square_url") or photo.get("url") or None,
            }

        print(f"    Page {page}: {len(data['results'])} species")
        if len(data["results"]) < PER_PAGE:
            break
        page += 1
        time.sleep(1)

    return species


def assign_rarity(species_list):
    for s in species_list:
        c = s["caribbeanObsCount"]
        if c >= 500:
            s["rarity"] = "common"
        elif c >= 50:
            s["rarity"] = "uncommon"
        elif c >= 5:
            s["rarity"] = "rare"
        else:
            s["rarity"] = "legendary"


def main():
    boxes_path = BOXES_PATH if os.path.exists(BOXES_PATH) else BOXES_EXAMPLE_PATH
    with open(boxes_path) as f:
        boxes = json.load(f)

    merged = {}

    for taxon_id, group, label in GROUPS:
        print(f"Fetching {label}...")

        group_species = {}
        for bbox in boxes:
            print(f"  {bbox['name']}: {bbox['swlat']}°N–{bbox['nelat']}°N, {bbox['swlng']}°W–{bbox['nelng']}°W")
            box_result = fetch_box(taxon_id, bbox)

            for tid, sp in box_result.items():
                if tid in group_species:
                    group_species[tid]["caribbeanObsCount"] += sp["caribbeanObsCount"]
                    if not group_species[tid]["photoUrl"] and sp["photoUrl"]:
                        group_species[tid]["photoUrl"] = sp["photoUrl"]
                else:
                    group_species[tid] = dict(sp)

        before = len(merged)
        for tid, sp in group_species.items():
            sp["group"] = group
            merged[tid] = sp

        print(f"  Total {label}: {len(group_species)} (merged)")
        time.sleep(1)

    all_species = list(merged.values())
    before = len(all_species)
    all_species = [s for s in all_species if not is_land_crab(s)]
    print(f"\nFiltered {before - len(all_species)} land crabs")
    all_species.sort(key=lambda s: s["caribbeanObsCount"], reverse=True)
    assign_rarity(all_species)

    with open(OUT, "w") as f:
        json.dump(all_species, f, indent=2)

    print(f"\nDone. Wrote {len(all_species)} species to {OUT}")
    print("Rarity (obs-count thresholds):")
    for g_label, g_key in [("fish", "fish"), ("elasmobranch", "elasmobranch"),
                            ("turtle", "turtle"), ("crustacean", "crustacean"),
                            ("cephalopod", "cephalopod"), ("gastropod", "gastropod")]:
        gs = [s for s in all_species if s["group"] == g_key]
        counts = {}
        for s in gs:
            counts[s["rarity"]] = counts.get(s["rarity"], 0) + 1
        print(f"  {g_label}: {len(gs)} — {counts}")


if __name__ == "__main__":
    main()
