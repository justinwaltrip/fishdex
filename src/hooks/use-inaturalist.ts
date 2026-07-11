import { useQuery } from "@tanstack/react-query";
import {
  fetchAllUserObservations,
  fetchUserObservations,
  type INaturalistObservation,
  type UserObservation,
  type ObservedSpecies,
  type CaribbeanSpecies,
} from "@/lib/inaturalist";

const USER_LOGIN = "jwaltrip";

function groupObservations(obs: UserObservation[]): Map<
  number,
  {
    obs: UserObservation[];
    name: string;
    commonName: string;
    rank: string;
    bestPhoto: string | null;
  }
> {
  const groups = new Map<
    number,
    {
      obs: UserObservation[];
      name: string;
      commonName: string;
      rank: string;
      bestPhoto: string | null;
    }
  >();

  for (const o of obs) {
    const existing = groups.get(o.taxonId);
    if (existing) {
      existing.obs.push(o);
      if (!existing.bestPhoto && o.photoUrl) {
        existing.bestPhoto = o.photoUrl;
      }
    } else {
      groups.set(o.taxonId, {
        obs: [o],
        name: o.taxonName,
        commonName: o.commonName ?? o.speciesGuess ?? o.taxonName,
        rank: o.taxonRank,
        bestPhoto: o.photoUrl,
      });
    }
  }

  return groups;
}

async function loadSpeciesLookup(): Promise<
  Map<number, { caribbeanObsCount: number; rarity: string; group: string; maxLengthCm?: number }>
> {
  const map = new Map<number, { caribbeanObsCount: number; rarity: string; group: string; maxLengthCm?: number }>();
  try {
    const mod = await import("@/data/caribbean-species.json");
    const raw = mod.default as {
      taxonId: number;
      caribbeanObsCount: number;
      rarity: string;
      group: string;
      maxLengthCm?: number;
    }[];
    for (const s of raw) {
      map.set(s.taxonId, {
        caribbeanObsCount: s.caribbeanObsCount,
        rarity: s.rarity,
        group: s.group,
        maxLengthCm: s.maxLengthCm,
      });
    }
  } catch {
    /* JSON not found */
  }
  return map;
}

async function loadCaribbeanSpecies(): Promise<CaribbeanSpecies[]> {
  try {
    const mod = await import("@/data/caribbean-species.json");
    const raw = mod.default as {
      taxonId: number;
      scientificName: string;
      commonName: string;
      caribbeanObsCount: number;
      rarity: string;
      group: string;
      photoUrl: string | null;
      maxLengthCm?: number;
    }[];
    return raw.map((r) => ({
      taxonId: r.taxonId,
      scientificName: r.scientificName,
      commonName: r.commonName || r.scientificName,
      photoUrl: r.photoUrl,
      caribbeanObsCount: r.caribbeanObsCount,
      rarity: r.rarity as CaribbeanSpecies["rarity"],
      group: r.group,
      maxLengthCm: r.maxLengthCm,
    }));
  } catch {
    return [];
  }
}

export function useObservedSpecies() {
  return useQuery<ObservedSpecies[]>({
    queryKey: ["inaturalist", "observed-species", USER_LOGIN],
    queryFn: async () => {
      const [allObs, lookup] = await Promise.all([
        fetchAllUserObservations(USER_LOGIN),
        loadSpeciesLookup(),
      ]);
      const groups = groupObservations(allObs);

      return Array.from(groups.entries())
        .map(([taxonId, g]) => {
          const info = lookup.get(taxonId);
          const latest = g.obs[0];
          return {
            taxonId,
            scientificName: g.name,
            commonName: g.commonName,
            photoUrl: g.bestPhoto,
            userObsCount: g.obs.length,
            caribbeanObsCount: info?.caribbeanObsCount ?? 0,
            rarity: (info?.rarity ?? "unknown") as ObservedSpecies["rarity"],
            group: info?.group ?? "unknown",
            taxonRank: g.rank,
            latestObservedAt: latest.observedAt,
            latestPlaceGuess: latest.placeGuess,
            latestObservationId: latest.id,
            maxLengthCm: info?.maxLengthCm,
          };
        })
        .filter((s) => s.rarity !== "unknown")
        .sort(
          (a, b) => b.userObsCount - a.userObsCount || b.caribbeanObsCount - a.caribbeanObsCount,
        );
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useMissingSpecies() {
  return useQuery<CaribbeanSpecies[]>({
    queryKey: ["inaturalist", "missing-species", USER_LOGIN],
    queryFn: async () => {
      const [allObs, caribbeanSpecies] = await Promise.all([
        fetchAllUserObservations(USER_LOGIN),
        loadCaribbeanSpecies(),
      ]);

      const observedIds = new Set(allObs.map((o) => o.taxonId));

      return caribbeanSpecies
        .filter((s) => !observedIds.has(s.taxonId))
        .sort((a, b) => b.caribbeanObsCount - a.caribbeanObsCount);
    },
    staleTime: 1000 * 60 * 30,
  });
}

export function useSpeciesObservations(taxonId: number | undefined) {
  return useQuery<INaturalistObservation[]>({
    queryKey: ["inaturalist", "species-observations", USER_LOGIN, taxonId],
    queryFn: () => fetchUserObservations(taxonId!, USER_LOGIN, 20),
    enabled: typeof taxonId === "number" && taxonId > 0,
    staleTime: 1000 * 60 * 15,
  });
}
