#!/usr/bin/env python3
"""
Refresh caribbean-species.json from iNaturalist API.
Fetches all fish species observed in the Caribbean bounding box
with Caribbean observation counts.

Rarity is **percentile-based** on Caribbean observation counts:
  - Top 20% by Caribbean count → Common
  - Next 30% → Uncommon
  - Next 30% → Rare
  - Bottom 20% → Legendary
"""
import json, urllib.request, urllib.parse, time, os

OUT = os.path.join(os.path.dirname(__file__), "..", "src", "data", "caribbean-species.json")

CARIBBEAN_BBOX = {"nelat": 25, "nelng": -60, "swlat": 10, "swlng": -90}
TAXON_ID = 47178  # Actinopterygii (ray-finned fish)
PER_PAGE = 500

def assign_rarity(species_list):
    n = len(species_list)
    p20 = n * 0.20
    p50 = n * 0.50
    p80 = n * 0.80
    for i, s in enumerate(species_list):
        if i < p20:
            s["rarity"] = "common"
        elif i < p50:
            s["rarity"] = "uncommon"
        elif i < p80:
            s["rarity"] = "rare"
        else:
            s["rarity"] = "legendary"

def main():
    print("Fetching Caribbean species...")
    all_species = []
    page = 1

    while True:
        params = urllib.parse.urlencode({
            "nelat": CARIBBEAN_BBOX["nelat"], "nelng": CARIBBEAN_BBOX["nelng"],
            "swlat": CARIBBEAN_BBOX["swlat"], "swlng": CARIBBEAN_BBOX["swlng"],
            "taxon_id": TAXON_ID, "per_page": PER_PAGE, "page": page,
            "quality_grade": "research",
        })
        url = f"https://api.inaturalist.org/v1/observations/species_counts?{params}"
        req = urllib.request.Request(url, headers={"User-Agent": "Fishdex/1.0"})
        data = json.loads(urllib.request.urlopen(req).read())

        for r in data["results"]:
            t = r["taxon"]
            photo = t.get("default_photo", {})
            all_species.append({
                "taxonId": t["id"],
                "scientificName": t["name"],
                "commonName": t.get("preferred_common_name", ""),
                "caribbeanObsCount": r["count"],
                "rarity": "legendary",
                "photoUrl": photo.get("square_url") or photo.get("url") or None,
            })

        print(f"  Page {page}: {len(data['results'])} species")
        if len(data["results"]) < PER_PAGE:
            break
        page += 1
        time.sleep(1)

    assign_rarity(all_species)

    with open(OUT, "w") as f:
        json.dump(all_species, f, indent=2)

    counts = {}
    for s in all_species:
        counts[s["rarity"]] = counts.get(s["rarity"], 0) + 1

    print(f"\nDone. Wrote {len(all_species)} species to {OUT}")
    print("Rarity (percentile-based on Caribbean counts):")
    for r in ["common", "uncommon", "rare", "legendary"]:
        pct = counts.get(r, 0) / len(all_species) * 100
        print(f"  {r}: {counts.get(r, 0)} ({pct:.0f}%)")

if __name__ == "__main__":
    main()
