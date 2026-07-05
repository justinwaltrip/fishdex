#!/usr/bin/env python3
"""
Refresh caribbean-species.json from iNaturalist API.
Fetches marine species observed in the Caribbean bounding box
across four groups: fish, sharks/rays, turtles, and crustaceans.

Rarity is **percentile-based** on Caribbean observation counts
across all groups combined.
"""
import json, urllib.request, urllib.parse, time, os

OUT = os.path.join(os.path.dirname(__file__), "..", "src", "data", "caribbean-species.json")

CARIBBEAN_BBOX = {"nelat": 25, "nelng": -60, "swlat": 10, "swlng": -90}
PER_PAGE = 500

GROUPS = [
    (47178, "fish", "Ray-finned fish"),
    (47273, "elasmobranch", "Sharks & rays"),
    (39532, "turtle", "Turtles"),
    (47186, "crustacean", "Crabs, lobsters & shrimp"),
    (47459, "cephalopod", "Octopus & squid"),
    (62602, "gastropod", "Conch & allies"),
]

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
    all_species = []

    for taxon_id, group, label in GROUPS:
        print(f"Fetching {label}...")
        page = 1

        while True:
            params = urllib.parse.urlencode({
                "nelat": CARIBBEAN_BBOX["nelat"], "nelng": CARIBBEAN_BBOX["nelng"],
                "swlat": CARIBBEAN_BBOX["swlat"], "swlng": CARIBBEAN_BBOX["swlng"],
                "taxon_id": taxon_id, "quality_grade": "research",
                "per_page": PER_PAGE, "page": page,
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
                    "group": group,
                    "photoUrl": photo.get("square_url") or photo.get("url") or None,
                })

            print(f"  Page {page}: {len(data['results'])} species")
            if len(data["results"]) < PER_PAGE:
                break
            page += 1
            time.sleep(1)

        gs = [s for s in all_species if s["group"] == group]
        print(f"  Total {label}: {len(gs)}")

    # Sort by Caribbean count descending, then assign percentiles
    all_species.sort(key=lambda s: s["caribbeanObsCount"], reverse=True)
    assign_rarity(all_species)

    with open(OUT, "w") as f:
        json.dump(all_species, f, indent=2)

    print(f"\nDone. Wrote {len(all_species)} species to {OUT}")
    print("Rarity (percentile-based across all groups):")
    for g in ["fish", "elasmobranch", "turtle", "crustacean"]:
        gs = [s for s in all_species if s["group"] == g]
        counts = {}
        for s in gs:
            counts[s["rarity"]] = counts.get(s["rarity"], 0) + 1
        print(f"  {g}: {len(gs)} — {counts}")

if __name__ == "__main__":
    main()
