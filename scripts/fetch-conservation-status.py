#!/usr/bin/env python3
"""
Fetch IUCN conservation status from iNaturalist for all Caribbean species.

Reads src/data/caribbean-species.json, calls the iNaturalist /v1/taxa
endpoint in batches of 200 IDs, and writes src/data/conservation-status.json
keyed by taxonId.
"""
import json, urllib.request, time, os

SPECIES_PATH = os.path.join(os.path.dirname(__file__), "..", "src", "data", "caribbean-species.json")
OUT = os.path.join(os.path.dirname(__file__), "..", "src", "data", "conservation-status.json")

BATCH_SIZE = 200
BASE = "https://api.inaturalist.org/v1"
USER_AGENT = "Fishdex/1.0"


def fetch_batch(ids):
    """Fetch conservation status for a batch of taxon IDs."""
    params = "&".join(f"id%5B%5D={tid}" for tid in ids)
    params += f"&per_page={BATCH_SIZE}"
    url = f"{BASE}/taxa?{params}"
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    data = json.loads(urllib.request.urlopen(req).read())

    results = {}
    for r in data.get("results", []):
        cs = r.get("conservation_status")
        if cs and cs.get("authority") == "IUCN Red List":
            results[r["id"]] = {
                "status": cs["status"],
                "statusName": cs.get("status_name", ""),
                "authority": cs["authority"],
                "iucn": cs.get("iucn"),
                "url": cs.get("url", ""),
            }

    return results


def main():
    with open(SPECIES_PATH) as f:
        species_list = json.load(f)

    taxon_ids = [s["taxonId"] for s in species_list]
    print(f"Fetching conservation status for {len(taxon_ids)} species...")

    all_results = {}
    for i in range(0, len(taxon_ids), BATCH_SIZE):
        batch = taxon_ids[i : i + BATCH_SIZE]
        batch_num = i // BATCH_SIZE + 1
        total_batches = (len(taxon_ids) + BATCH_SIZE - 1) // BATCH_SIZE
        print(f"  Batch {batch_num}/{total_batches} ({len(batch)} IDs)...", end=" ", flush=True)

        try:
            batch_results = fetch_batch(batch)
            all_results.update(batch_results)
            print(f"{len(batch_results)} with IUCN status")
        except Exception as e:
            print(f"ERROR: {e}")

        if i + BATCH_SIZE < len(taxon_ids):
            time.sleep(1)

    print(f"\nTotal species with IUCN status: {len(all_results)}")

    with open(OUT, "w") as f:
        json.dump(all_results, f, indent=2, sort_keys=True)

    # Print a summary by status
    by_status = {}
    for data in all_results.values():
        s = data["status"]
        by_status[s] = by_status.get(s, 0) + 1

    print("By category:")
    for status in sorted(by_status.keys()):
        print(f"  {status}: {by_status[status]}")

    print(f"Wrote to {OUT}")


if __name__ == "__main__":
    main()
