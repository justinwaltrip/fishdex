#!/usr/bin/env python3
"""
Refresh caribbean-species.json from iNaturalist API.

Uses two stitched bounding boxes to cover the Caribbean Sea while
avoiding Pacific spillover through the narrow Central American isthmus:

  Box North: 23.5°N–13°N, -88°W–-60°W  (Cozumel, Belize, Roatán, Caymans, Greater Antilles)
  Box South: 13°N–8°N,  -82°W–-60°W  (Panama, Colombia, Venezuela, ABC islands)

Rarity thresholds are based on raw observation frequency:

  Common:     obs >= 500
  Uncommon:   obs >= 50
  Rare:       obs >= 5
  Legendary:  obs < 5
"""
import json, urllib.request, urllib.parse, time, os

OUT = os.path.join(os.path.dirname(__file__), "..", "src", "data", "caribbean-species.json")

CARIBBEAN_BOXES = [
    {"nelat": 23.5, "nelng": -60, "swlat": 13, "swlng": -88},
    {"nelat": 13,   "nelng": -60, "swlat": 8,  "swlng": -82},
]

PER_PAGE = 500

GROUPS = [
    (47178, "fish", "Ray-finned fish"),
    (47273, "elasmobranch", "Sharks & rays"),
    (39532, "turtle", "Turtles"),
    (47186, "crustacean", "Crabs, lobsters & shrimp"),
    (47459, "cephalopod", "Octopus & squid"),
    (62602, "gastropod", "Conch & allies"),
]


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
    merged = {}

    for taxon_id, group, label in GROUPS:
        print(f"Fetching {label}...")

        group_species = {}
        for i, bbox in enumerate(CARIBBEAN_BOXES):
            box_label = "North" if i == 0 else "South"
            print(f"  Box {box_label}: {bbox['swlat']}°N–{bbox['nelat']}°N, {bbox['swlng']}°W–{bbox['nelng']}°W")
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
