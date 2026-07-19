import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMemo, useState, useCallback } from "react";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Fish,
  MapPin,
  Search,
  ExternalLink,
  EyeOff,
  PanelLeftClose,
  PanelLeft,
  Loader2,
  RefreshCw,
  CalendarDays,
  X,
} from "lucide-react";
import fishbaseSizes from "@/data/fishbase-sizes.json";
import conservationStatuses from "@/data/conservation-status.json";
import { LOCATIONS, isInBBox } from "@/data/locations";

import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  useObservedSpecies,
  useMissingSpecies,
  useSpeciesObservations,
  useAllUserObservations,
} from "@/hooks/use-inaturalist";
import {
  type ObservedSpecies,
  type CaribbeanSpecies,
  type INaturalistObservation,
} from "@/lib/inaturalist";
import { cn } from "@/lib/utils";
import { invalidateCache } from "@/lib/cache";

const searchSchema = z.object({
  q: z.string().catch(""),
  rarity: z.string().catch("all"),
  group: z.string().catch("all"),
  seen: z.string().catch("all"),
  size: z.string().catch("all"),
  location: z.string().catch("all"),
  date: z.string().catch("all"),
  day: z.string().catch(""),
  conservation: z.string().catch("all"),
  new: z.string().catch("all"),
});

export const Route = createFileRoute("/")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Fishdex — Caribbean Fish Dashboard" },
      {
        name: "description",
        content: "Caribbean reef fish observations powered by iNaturalist.",
      },
      { property: "og:title", content: "Fishdex — Caribbean Fish Dashboard" },
      {
        property: "og:description",
        content: "Track your Caribbean fish sightings and discover new species to find.",
      },
    ],
  }),
  component: FishdexPage,
});

const RARITY_META: Record<string, { label: string; className: string }> = {
  common: { label: "Common", className: "bg-muted text-muted-foreground" },
  uncommon: {
    label: "Uncommon",
    className: "bg-[oklch(0.65_0.15_155)] text-[oklch(0.15_0.05_240)]",
  },
  rare: { label: "Rare", className: "bg-primary text-primary-foreground" },
  legendary: {
    label: "Legendary",
    className: "bg-accent text-accent-foreground",
  },
};

const GROUP_LABELS: Record<string, string> = {
  fish: "Fish",
  crustacean: "Crustaceans",
  tetrapod: "Sea Turtles & Mammals",
  cephalopod: "Cephalopods",
  gastropod: "Gastropods",
  echinoderm: "Echinoderms",
  jellyfish: "Jellies",
  bivalve: "Bivalves",
};

const RARITY_ORDER: Record<string, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  legendary: 3,
};

interface SizeTier {
  label: string;
  maxCm: number;
}

const SIZE_TIERS: SizeTier[] = [
  { label: "XS", maxCm: 5 },
  { label: "S", maxCm: 15 },
  { label: "M", maxCm: 40 },
  { label: "L", maxCm: 100 },
  { label: "XL", maxCm: 400 },
  { label: "XXL", maxCm: Infinity },
];

function getSizeInfo(taxonId: number): { maxLengthCm: number; sizeTier: SizeTier } | null {
  const raw = (fishbaseSizes as Record<string, unknown>)[String(taxonId)];
  if (!raw || typeof raw !== "object" || !("maxLengthCm" in raw)) return null;
  const maxLengthCm = (raw as { maxLengthCm: number }).maxLengthCm;
  const tier = SIZE_TIERS.find((t) => maxLengthCm < t.maxCm) ?? SIZE_TIERS[SIZE_TIERS.length - 1];
  return { maxLengthCm, sizeTier: tier };
}

function formatConservationStatus(taxonId: number): string | undefined {
  const cs = (conservationStatuses as Record<string, { status: string }>)[String(taxonId)];
  return cs?.status;
}

const CONSERVATION_META: Record<string, { label: string; className: string }> = {
  cr: { label: "CR", className: "bg-[oklch(0.45_0.22_25)] text-white" },
  en: { label: "EN", className: "bg-[oklch(0.55_0.18_55)] text-white" },
  vu: { label: "VU", className: "bg-[oklch(0.65_0.15_85)] text-[oklch(0.15_0.05_240)]" },
  nt: { label: "NT", className: "bg-[oklch(0.55_0.10_200)] text-white" },
};
const CONSERVATION_ORDER: Record<string, number> = { cr: 0, en: 1, vu: 2, nt: 3 };

const RARITIES = ["common", "uncommon", "rare", "legendary"];
const GROUPS = Object.keys(GROUP_LABELS);
const GROUP_ABBR: Record<string, string> = {
  fish: "Fish",
  crustacean: "Crust.",
  tetrapod: "Turt./Mam.",
  cephalopod: "Ceph.",
  gastropod: "Gastro.",
  echinoderm: "Echino.",
  jellyfish: "Jellies",
  bivalve: "Bivalves",
};

interface PokedexEntry {
  taxonId: number;
  dexNumber: number;
  scientificName: string;
  commonName: string;
  photoUrl: string | null;
  caribbeanObsCount: number;
  rarity: string;
  group: string;
  seen: boolean;
  isNew: boolean;
  userObsCount: number;
  latestPlaceGuess: string;
  maxLengthCm?: number;
  sizeTier?: SizeTier;
  conservationStatus?: string;
}

function FishdexPage() {
  const { data: allObs = [], isFetching } = useAllUserObservations();
  const { data: observed = [], isLoading: obsLoading } = useObservedSpecies();
  const { data: missing = [], isLoading: missLoading } = useMissingSpecies();
  const search = Route.useSearch();
  const router = useRouter();

  const query = search.q;
  const rarityFilter = search.rarity;
  const groupFilter = search.group;
  const seenFilter = search.seen;
  const sizeFilter = search.size;
  const locationFilter = search.location;
  const dateFilter = search.date;
  const dayFilter = search.day;
  const conservationFilter = search.conservation;
  const newFilter = search.new;

  const navigateSearch = useCallback(
    (update: Partial<typeof search>) => {
      router.navigate({
        search: (prev) => ({ ...prev, ...update }),
        replace: true,
      });
    },
    [router],
  );

  const setQuery = useCallback((v: string) => navigateSearch({ q: v }), [navigateSearch]);
  const setRarityFilter = useCallback(
    (v: string) => navigateSearch({ rarity: v }),
    [navigateSearch],
  );
  const setGroupFilter = useCallback((v: string) => navigateSearch({ group: v }), [navigateSearch]);
  const setSeenFilter = useCallback((v: string) => navigateSearch({ seen: v }), [navigateSearch]);
  const setSizeFilter = useCallback((v: string) => navigateSearch({ size: v }), [navigateSearch]);
  const setLocationFilter = useCallback(
    (v: string) => navigateSearch({ location: v }),
    [navigateSearch],
  );
  const setDateFilter = useCallback((v: string) => navigateSearch({ date: v }), [navigateSearch]);
  const setDayFilter = useCallback((v: string) => navigateSearch({ day: v }), [navigateSearch]);
  const setConservationFilter = useCallback(
    (v: string) => navigateSearch({ conservation: v }),
    [navigateSearch],
  );
  const setNewFilter = useCallback((v: string) => navigateSearch({ new: v }), [navigateSearch]);

  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const [selectedObserved, setSelectedObserved] = useState<ObservedSpecies | null>(null);
  const [selectedMissing, setSelectedMissing] = useState<CaribbeanSpecies | null>(null);
  const [selectedDexNumber, setSelectedDexNumber] = useState<number>(0);

  const isLoading = obsLoading || missLoading;

  const queryClient = useQueryClient();

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    for (const obs of allObs) {
      if (obs.observedAt) {
        const year = new Date(obs.observedAt).getFullYear();
        if (!Number.isNaN(year)) years.add(year);
      }
    }
    return Array.from(years).sort((a, b) => b - a);
  }, [allObs]);

  const newTaxonIds = useMemo(() => {
    if (observed.length === 0) return new Set<number>();
    let mostRecentDay = "";
    for (const sp of observed) {
      const day = sp.latestObservedAt.slice(0, 10);
      if (day > mostRecentDay) mostRecentDay = day;
    }
    const ids = new Set<number>();
    for (const sp of observed) {
      if (sp.earliestObservedAt.slice(0, 10) === mostRecentDay) {
        ids.add(sp.taxonId);
      }
    }
    return ids;
  }, [observed]);

  const handleRefreshCache = useCallback(() => {
    invalidateCache(`all_obs_${import.meta.env.VITE_INATURALIST_USERNAME}`);
    queryClient.invalidateQueries({ queryKey: ["inaturalist", "v2"] });
  }, [queryClient]);

  const dateFilteredAllObs = useMemo(() => {
    let result = allObs;
    if (dateFilter !== "all") {
      const year = Number.parseInt(dateFilter, 10);
      result = result.filter((o) => new Date(o.observedAt).getFullYear() === year);
    }
    if (dayFilter) {
      result = result.filter((o) => o.observedAt.slice(0, 10) === dayFilter);
    }
    return result;
  }, [allObs, dateFilter, dayFilter]);

  const isAnyFilterActive = dateFilter !== "all" || dayFilter !== "" || locationFilter !== "all";

  const filterSeenIds = useMemo(() => {
    if (!isAnyFilterActive) return null;
    const bbox =
      locationFilter !== "all" ? LOCATIONS.find((l) => l.name === locationFilter) : undefined;
    const ids = new Set<number>();
    for (const obs of dateFilteredAllObs) {
      if (bbox && !isInBBox(obs.latitude, obs.longitude, bbox)) continue;
      ids.add(obs.taxonId);
    }
    return ids;
  }, [dateFilteredAllObs, locationFilter, isAnyFilterActive]);

  const filterStats = useMemo(() => {
    if (!isAnyFilterActive) return null;
    const bbox =
      locationFilter !== "all" ? LOCATIONS.find((l) => l.name === locationFilter) : undefined;
    const stats = new Map<
      number,
      { count: number; latestPlaceGuess: string; latestObservedAt: string }
    >();
    for (const obs of dateFilteredAllObs) {
      if (bbox && !isInBBox(obs.latitude, obs.longitude, bbox)) continue;
      const existing = stats.get(obs.taxonId);
      if (existing) {
        existing.count++;
        if (obs.observedAt > existing.latestObservedAt) {
          existing.latestObservedAt = obs.observedAt;
          existing.latestPlaceGuess = obs.placeGuess;
        }
      } else {
        stats.set(obs.taxonId, {
          count: 1,
          latestPlaceGuess: obs.placeGuess,
          latestObservedAt: obs.observedAt,
        });
      }
    }
    return stats;
  }, [dateFilteredAllObs, locationFilter, isAnyFilterActive]);

  const pokedex = useMemo(() => {
    const seenMap = new Map<number, ObservedSpecies>();
    for (const o of observed) {
      if (o.rarity !== "unknown") seenMap.set(o.taxonId, o);
    }

    const entries: PokedexEntry[] = [];

    for (const s of observed) {
      if (s.rarity === "unknown") continue;
      const sizeInfo = getSizeInfo(s.taxonId);
      const seen = filterSeenIds ? filterSeenIds.has(s.taxonId) : true;
      const stat = filterStats?.get(s.taxonId);
      entries.push({
        taxonId: s.taxonId,
        dexNumber: 0,
        scientificName: s.scientificName,
        commonName: s.commonName,
        photoUrl: s.photoUrl,
        caribbeanObsCount: s.caribbeanObsCount,
        rarity: s.rarity,
        group: s.group,
        seen,
        isNew: newTaxonIds.has(s.taxonId),
        userObsCount: stat ? stat.count : s.userObsCount,
        latestPlaceGuess: stat ? stat.latestPlaceGuess : s.latestPlaceGuess,
        maxLengthCm: sizeInfo?.maxLengthCm,
        sizeTier: sizeInfo?.sizeTier,
        conservationStatus: formatConservationStatus(s.taxonId),
      });
    }

    for (const s of missing) {
      if (seenMap.has(s.taxonId)) continue;
      const sizeInfo = getSizeInfo(s.taxonId);
      entries.push({
        taxonId: s.taxonId,
        dexNumber: 0,
        scientificName: s.scientificName,
        commonName: s.commonName,
        photoUrl: s.photoUrl,
        caribbeanObsCount: s.caribbeanObsCount,
        rarity: s.rarity,
        group: s.group,
        seen: false,
        isNew: false,
        userObsCount: 0,
        latestPlaceGuess: "",
        maxLengthCm: sizeInfo?.maxLengthCm,
        sizeTier: sizeInfo?.sizeTier,
        conservationStatus: formatConservationStatus(s.taxonId),
      });
    }

    entries.sort((a, b) => {
      if (a.rarity !== b.rarity) return RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity];
      return b.caribbeanObsCount - a.caribbeanObsCount;
    });

    entries.forEach((e, i) => {
      e.dexNumber = i + 1;
    });

    return entries;
  }, [observed, missing, filterSeenIds, filterStats, newTaxonIds]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pokedex.filter((s) => {
      if (rarityFilter !== "all" && s.rarity !== rarityFilter) return false;
      if (groupFilter !== "all" && s.group !== groupFilter) return false;
      if (seenFilter === "seen" && !s.seen) return false;
      if (seenFilter === "unseen" && s.seen) return false;
      if (newFilter === "new" && !s.isNew) return false;
      if (sizeFilter !== "all" && (!s.sizeTier || s.sizeTier.label !== sizeFilter)) return false;
      if (conservationFilter !== "all") {
        if (conservationFilter === "none") {
          if (s.conservationStatus) return false;
        } else {
          if (s.conservationStatus !== conservationFilter) return false;
        }
      }
      if (!q) return true;
      return s.commonName.toLowerCase().includes(q) || s.scientificName.toLowerCase().includes(q);
    });
  }, [
    query,
    rarityFilter,
    groupFilter,
    seenFilter,
    newFilter,
    sizeFilter,
    conservationFilter,
    pokedex,
  ]);

  const total = pokedex.length;

  const filteredStats = useMemo(() => {
    const m: Record<string, Record<string, { seen: number; total: number }>> = {};
    for (const r of RARITIES) {
      const all = filtered.filter((s) => s.rarity === r);
      m[r] = {};
      for (const g of GROUPS) {
        const allRG = all.filter((s) => s.group === g);
        m[r][g] = {
          seen: allRG.filter((s) => s.seen).length,
          total: allRG.length,
        };
      }
    }
    return m;
  }, [filtered]);

  const handleOpen = useCallback(
    (entry: PokedexEntry) => {
      setSelectedDexNumber(entry.dexNumber);
      if (entry.seen) {
        const obs = observed.find((o) => o.taxonId === entry.taxonId);
        if (obs) setSelectedObserved(obs);
      } else {
        const miss = missing.find((m) => m.taxonId === entry.taxonId);
        if (miss) {
          setSelectedMissing(miss);
        } else {
          const globalObs = observed.find((o) => o.taxonId === entry.taxonId);
          if (globalObs) {
            setSelectedMissing({
              taxonId: globalObs.taxonId,
              scientificName: globalObs.scientificName,
              commonName: globalObs.commonName,
              photoUrl: globalObs.photoUrl,
              caribbeanObsCount: globalObs.caribbeanObsCount,
              rarity: globalObs.rarity as "common" | "uncommon" | "rare" | "legendary",
              group: globalObs.group,
            });
          }
        }
      }
    },
    [observed, missing],
  );

  const handleClose = useCallback(() => {
    setSelectedObserved(null);
    setSelectedMissing(null);
    setSelectedDexNumber(0);
  }, []);

  return (
    <div className="min-h-screen flex">
      <FilterSidebar
        query={query}
        onQuery={setQuery}
        rarity={rarityFilter}
        onRarity={setRarityFilter}
        group={groupFilter}
        onGroup={setGroupFilter}
        seen={seenFilter}
        onSeen={setSeenFilter}
        newFilter={newFilter}
        onNew={setNewFilter}
        size={sizeFilter}
        onSize={setSizeFilter}
        location={locationFilter}
        onLocation={setLocationFilter}
        date={dateFilter}
        onDate={setDateFilter}
        day={dayFilter}
        onDay={setDayFilter}
        conservation={conservationFilter}
        onConservation={setConservationFilter}
        years={availableYears}
        open={sidebarOpen}
        onToggle={() => setSidebarOpen((o) => !o)}
      />

      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col transition-[margin] duration-300 ease-in-out",
          sidebarOpen && "ml-72",
        )}
      >
        <PokedexHeader
          total={total}
          matrix={filteredStats}
          location={locationFilter}
          year={dateFilter}
          day={dayFilter}
          onRefresh={handleRefreshCache}
          isRefreshing={isFetching}
        />

        <main className="mx-auto w-full max-w-7xl px-4 pb-24 sm:px-6 lg:px-8">
          <p className="mt-6 font-mono text-xs uppercase tracking-widest text-muted-foreground">
            {filtered.length} of {pokedex.length} species
          </p>

          {isLoading ? (
            <FishdexLoader />
          ) : filtered.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filtered.map((entry) => (
                <PokedexCard key={entry.taxonId} entry={entry} onOpen={() => handleOpen(entry)} />
              ))}
            </div>
          )}
        </main>
      </div>

      <ObservedDetailDialog
        species={selectedObserved}
        dexNumber={selectedDexNumber}
        onClose={handleClose}
        isNew={selectedObserved ? newTaxonIds.has(selectedObserved.taxonId) : false}
      />
      <MissingDetailDialog
        species={selectedMissing}
        dexNumber={selectedDexNumber}
        onClose={handleClose}
      />
    </div>
  );
}

function PokedexHeader({
  total,
  matrix,
  location,
  year,
  day,
  onRefresh,
  isRefreshing,
}: {
  total: number;
  matrix: Record<string, Record<string, { seen: number; total: number }>>;
  location: string;
  year: string;
  day: string;
  onRefresh: () => void;
  isRefreshing: boolean;
}) {
  const dateLabel = day
    ? new Date(day + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : null;
  return (
    <header className="border-b border-border/50 bg-[oklch(0.14_0.06_245)]/60 backdrop-blur-xl">
      <div className="scanline">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/15 ring-1 ring-primary/40 animate-float">
              <Fish className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1">
              <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-primary/80">
                Caribbean · iNaturalist
                {location !== "all" && ` · ${location}`}
                {year !== "all" && ` · ${year}`}
                {dateLabel && ` · ${dateLabel}`}
              </p>
              <h1 className="text-3xl font-bold text-glow sm:text-4xl">Fishdex</h1>
            </div>
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-border/50 bg-background/50 px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
              title="Clear cache and refresh all data from iNaturalist"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
              {isRefreshing ? "Refreshing…" : "Refresh"}
            </button>
          </div>
          <p className="mt-3 max-w-xl text-sm text-muted-foreground">
            Track your Caribbean sightings — {total} species, how many can you find?
            {location !== "all" && ` (filtered to ${location})`}
            {year !== "all" && !dateLabel && ` (in ${year})`}
            {dateLabel && ` (on ${dateLabel})`}
          </p>

          <FilteredDetailMatrix matrix={matrix} />
        </div>
      </div>
    </header>
  );
}

function FilteredDetailMatrix({
  matrix,
}: {
  matrix: Record<string, Record<string, { seen: number; total: number }>>;
}) {
  const rowTotals: Record<string, { seen: number; total: number }> = {};
  for (const r of RARITIES) {
    let seen = 0;
    let total = 0;
    for (const g of GROUPS) {
      const c = matrix[r]?.[g] ?? { seen: 0, total: 0 };
      seen += c.seen;
      total += c.total;
    }
    rowTotals[r] = { seen, total };
  }

  const colTotals: Record<string, { seen: number; total: number }> = {};
  let grandSeen = 0;
  let grandTotal = 0;
  for (const g of GROUPS) {
    let seen = 0;
    let total = 0;
    for (const r of RARITIES) {
      const c = matrix[r]?.[g] ?? { seen: 0, total: 0 };
      seen += c.seen;
      total += c.total;
    }
    colTotals[g] = { seen, total };
    grandSeen += seen;
    grandTotal += total;
  }

  return (
    <div className="mt-6 rounded-2xl border border-border/50 bg-card/40 p-5">
      <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        Detail Matrix
      </p>
      <div className="overflow-x-auto">
        <table className="w-full font-mono tabular-nums">
          <thead>
            <tr className="border-b border-border/30">
              <th className="pr-3 pb-2 text-left text-[10px] font-normal text-muted-foreground" />
              {GROUPS.map((g) => (
                <th
                  key={g}
                  className="px-2 pb-2 text-center text-[10px] font-normal text-muted-foreground"
                >
                  {GROUP_ABBR[g]}
                </th>
              ))}
              <th className="px-2 pb-2 text-center text-[10px] font-normal text-muted-foreground">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {RARITIES.map((r) => {
              const rt = rowTotals[r];
              return (
                <tr key={r} className="border-b border-border/10">
                  <td className="pr-3 py-2 text-left text-[10px] text-muted-foreground">
                    {RARITY_META[r].label}
                  </td>
                  {GROUPS.map((g) => {
                    const cell = matrix[r]?.[g] ?? { seen: 0, total: 0 };
                    const pct = cell.total > 0 ? Math.round((cell.seen / cell.total) * 100) : 0;
                    const isFull = cell.seen === cell.total && cell.total > 0;
                    const hasSome = cell.seen > 0 && cell.total > 0;
                    return (
                      <td key={g} className="px-1 py-1.5">
                        {cell.total > 0 ? (
                          <div
                            className={cn(
                              "flex flex-col items-center justify-center rounded-lg px-2 py-1.5 min-w-[4rem]",
                              isFull
                                ? "bg-accent/20 border border-accent/30 animate-pulse-glow"
                                : hasSome
                                  ? "bg-primary/10 border border-primary/20"
                                  : "bg-muted/20 border border-border/10",
                            )}
                          >
                            <span
                              className={cn(
                                "text-[10px]",
                                isFull
                                  ? "text-accent"
                                  : hasSome
                                    ? "text-primary"
                                    : "text-muted-foreground/50",
                              )}
                            >
                              {cell.seen}/{cell.total}
                            </span>
                            <span
                              className={cn(
                                "text-sm font-semibold",
                                isFull
                                  ? "text-accent"
                                  : hasSome
                                    ? "text-primary/80"
                                    : "text-muted-foreground/40",
                              )}
                            >
                              {pct}%
                            </span>
                          </div>
                        ) : (
                          <span className="text-[10px] text-muted-foreground/30 block text-center">
                            —
                          </span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-1 py-1.5">
                    {rt.total > 0 ? (
                      <div
                        className={cn(
                          "flex flex-col items-center justify-center rounded-lg px-2 py-1.5 min-w-[4rem]",
                          rt.seen === rt.total
                            ? "bg-accent/20 border border-accent/30 animate-pulse-glow"
                            : rt.seen > 0
                              ? "bg-primary/10 border border-primary/20"
                              : "bg-muted/20 border border-border/10",
                        )}
                      >
                        <span
                          className={cn(
                            "text-[10px]",
                            rt.seen === rt.total
                              ? "text-accent"
                              : rt.seen > 0
                                ? "text-primary"
                                : "text-muted-foreground/50",
                          )}
                        >
                          {rt.seen}/{rt.total}
                        </span>
                        <span
                          className={cn(
                            "text-sm font-semibold",
                            rt.seen === rt.total
                              ? "text-accent"
                              : rt.seen > 0
                                ? "text-primary/80"
                                : "text-muted-foreground/40",
                          )}
                        >
                          {Math.round((rt.seen / rt.total) * 100)}%
                        </span>
                      </div>
                    ) : (
                      <span className="text-[10px] text-muted-foreground/30 block text-center">
                        —
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-border/30">
              <td className="pr-3 py-2 text-left text-[10px] text-muted-foreground font-medium">
                Total
              </td>
              {GROUPS.map((g) => {
                const ct = colTotals[g];
                return (
                  <td key={g} className="px-1 py-1.5">
                    {ct.total > 0 ? (
                      <div
                        className={cn(
                          "flex flex-col items-center justify-center rounded-lg px-2 py-1.5 min-w-[4rem]",
                          ct.seen === ct.total
                            ? "bg-accent/20 border border-accent/30 animate-pulse-glow"
                            : ct.seen > 0
                              ? "bg-primary/10 border border-primary/20"
                              : "bg-muted/20 border border-border/10",
                        )}
                      >
                        <span
                          className={cn(
                            "text-[10px]",
                            ct.seen === ct.total
                              ? "text-accent"
                              : ct.seen > 0
                                ? "text-primary"
                                : "text-muted-foreground/50",
                          )}
                        >
                          {ct.seen}/{ct.total}
                        </span>
                        <span
                          className={cn(
                            "text-sm font-semibold",
                            ct.seen === ct.total
                              ? "text-accent"
                              : ct.seen > 0
                                ? "text-primary/80"
                                : "text-muted-foreground/40",
                          )}
                        >
                          {Math.round((ct.seen / ct.total) * 100)}%
                        </span>
                      </div>
                    ) : (
                      <span className="text-[10px] text-muted-foreground/30 block text-center">
                        —
                      </span>
                    )}
                  </td>
                );
              })}
              <td className="px-1 py-1.5">
                {grandTotal > 0 ? (
                  <div
                    className={cn(
                      "flex flex-col items-center justify-center rounded-lg px-2 py-1.5 min-w-[4rem]",
                      grandSeen === grandTotal
                        ? "bg-accent/20 border border-accent/30 animate-pulse-glow"
                        : grandSeen > 0
                          ? "bg-primary/10 border border-primary/20"
                          : "bg-muted/20 border border-border/10",
                    )}
                  >
                    <span
                      className={cn(
                        "text-[10px]",
                        grandSeen === grandTotal
                          ? "text-accent"
                          : grandSeen > 0
                            ? "text-primary"
                            : "text-muted-foreground/50",
                      )}
                    >
                      {grandSeen}/{grandTotal}
                    </span>
                    <span
                      className={cn(
                        "text-sm font-semibold",
                        grandSeen === grandTotal
                          ? "text-accent"
                          : grandSeen > 0
                            ? "text-primary/80"
                            : "text-muted-foreground/40",
                      )}
                    >
                      {Math.round((grandSeen / grandTotal) * 100)}%
                    </span>
                  </div>
                ) : (
                  <span className="text-[10px] text-muted-foreground/30 block text-center">—</span>
                )}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function FilterSidebar(props: {
  query: string;
  onQuery: (v: string) => void;
  rarity: string;
  onRarity: (v: string) => void;
  group: string;
  onGroup: (v: string) => void;
  seen: string;
  onSeen: (v: string) => void;
  newFilter: string;
  onNew: (v: string) => void;
  size: string;
  onSize: (v: string) => void;
  location: string;
  onLocation: (v: string) => void;
  date: string;
  onDate: (v: string) => void;
  day: string;
  onDay: (v: string) => void;
  conservation: string;
  onConservation: (v: string) => void;
  years: number[];
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="fixed left-0 top-0 z-10 h-screen">
      <div
        className={cn(
          "h-full overflow-hidden transition-[width] duration-300 ease-in-out",
          props.open ? "w-72" : "w-0",
        )}
      >
        <aside className="flex h-full w-72 flex-col border-r border-border/50 bg-[oklch(0.14_0.06_245)]/40">
          <div className="flex shrink-0 items-center border-b border-border/30 py-4 pl-4 pr-4">
            <h2 className="whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.3em] text-primary/80">
              Filters
            </h2>
          </div>

          <div className="flex min-w-72 flex-shrink-0 flex-1 flex-col space-y-4 overflow-y-auto px-4 py-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={props.query}
                onChange={(e) => props.onQuery(e.target.value)}
                placeholder="Search species…"
                className="h-10 border-border/60 bg-card/50 pl-9 pr-9 font-mono text-sm placeholder:text-muted-foreground/60"
              />
              {props.query && (
                <button
                  onClick={() => props.onQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <ChipGroup
                label="Seen"
                value={props.seen}
                onChange={props.onSeen}
                options={[
                  { value: "all", label: "All" },
                  { value: "seen", label: "Seen" },
                  { value: "unseen", label: "Unseen" },
                ]}
              />
              <ChipGroup
                label="Recent"
                value={props.newFilter}
                onChange={props.onNew}
                options={[
                  { value: "all", label: "All" },
                  { value: "new", label: "New" },
                ]}
              />
            </div>

            <div className="flex flex-col gap-2">
              <ChipGroup
                label="Rarity"
                value={props.rarity}
                onChange={props.onRarity}
                options={[
                  { value: "all", label: "All" },
                  ...Object.entries(RARITY_META).map(([k, m]) => ({
                    value: k,
                    label: m.label,
                  })),
                ]}
              />
            </div>

            <div className="flex flex-col gap-2">
              <ChipGroup
                label="Group"
                value={props.group}
                onChange={props.onGroup}
                options={[
                  { value: "all", label: "All" },
                  ...Object.entries(GROUP_LABELS).map(([k, label]) => ({
                    value: k,
                    label,
                  })),
                ]}
              />
            </div>

            <div className="flex flex-col gap-2">
              <ChipGroup
                label="Size"
                value={props.size}
                onChange={props.onSize}
                options={[
                  { value: "all", label: "All" },
                  ...SIZE_TIERS.map((t) => ({
                    value: t.label,
                    label: t.label,
                  })),
                ]}
              />
            </div>

            <div className="flex flex-col gap-2">
              <ChipGroup
                label="IUCN"
                value={props.conservation}
                onChange={props.onConservation}
                options={[
                  { value: "all", label: "All" },
                  { value: "none", label: "None" },
                  ...Object.entries(CONSERVATION_META).map(([k, m]) => ({
                    value: k,
                    label: m.label,
                  })),
                ]}
              />
            </div>

            <div className="flex flex-col gap-2">
              <ChipGroup
                label="Location"
                value={props.location}
                onChange={props.onLocation}
                options={[
                  { value: "all", label: "All" },
                  ...LOCATIONS.map((l) => ({
                    value: l.name,
                    label: l.name,
                  })),
                ]}
              />
            </div>

            {props.years.length > 0 && (
              <div className="flex flex-col gap-2">
                <ChipGroup
                  label="Year"
                  value={props.date}
                  onChange={props.onDate}
                  options={[
                    { value: "all", label: "All" },
                    ...props.years.map((y) => ({
                      value: String(y),
                      label: String(y),
                    })),
                  ]}
                />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/80">
                Day
              </span>
              <div className="flex items-center gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "h-10 flex-1 justify-start border-border/60 bg-card/50 font-mono text-sm font-normal",
                        !props.day && "text-muted-foreground",
                      )}
                    >
                      <CalendarDays className="mr-2 h-4 w-4 text-muted-foreground" />
                      {props.day
                        ? format(new Date(props.day + "T00:00:00"), "MMM d, yyyy")
                        : "Pick a day"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto border-border/60 bg-card p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={props.day ? new Date(props.day + "T00:00:00") : undefined}
                      onSelect={(date) => props.onDay(date ? format(date, "yyyy-MM-dd") : "")}
                      initialFocus
                      buttonVariant="ghost"
                    />
                  </PopoverContent>
                </Popover>
                {props.day && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => props.onDay("")}
                    className="h-10 w-10 flex-shrink-0 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </aside>
      </div>

      <button
        onClick={props.onToggle}
        className={cn(
          "absolute top-2.5 flex h-8 w-8 items-center justify-center rounded-lg border border-border/50 bg-card/80 text-muted-foreground transition-all duration-300 ease-in-out hover:border-primary/40 hover:text-primary",
          props.open ? "right-4" : "left-2",
        )}
      >
        {props.open ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
      </button>
    </div>
  );
}

function ChipGroup({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/80">
        {label}
      </span>
      <div className="flex flex-wrap gap-1">
        {options.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => onChange(opt.value)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                active
                  ? "border-primary/60 bg-primary/15 text-primary"
                  : "border-border/50 bg-card/40 text-muted-foreground hover:border-border hover:text-foreground",
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Fishspan({ maxLengthCm }: { maxLengthCm: number }) {
  const tier = SIZE_TIERS.find((t) => maxLengthCm < t.maxCm) ?? SIZE_TIERS[SIZE_TIERS.length - 1];
  const idx = SIZE_TIERS.indexOf(tier);

  return (
    <div className="flex items-center gap-px">
      {SIZE_TIERS.map((_, i) => (
        <Fish
          key={i}
          className={cn(i <= idx ? "text-muted-foreground/50" : "text-muted-foreground/10")}
          style={{ width: `${10 + i * 3}px`, height: `${10 + i * 3}px` }}
          strokeWidth={i <= idx ? 1.5 : 2}
        />
      ))}
    </div>
  );
}

function PokedexCard({ entry, onOpen }: { entry: PokedexEntry; onOpen: () => void }) {
  const rarity = RARITY_META[entry.rarity];
  const conservation = entry.conservationStatus && CONSERVATION_META[entry.conservationStatus];
  const isThreatened = entry.conservationStatus === "cr" || entry.conservationStatus === "en";

  return (
    <button
      onClick={onOpen}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl border p-5 text-left transition-all hover:-translate-y-0.5",
        isThreatened && !entry.seen
          ? "border-[oklch(0.50_0.20_25)]/50 bg-card/60 card-glow-threatened hover:border-[oklch(0.50_0.20_25)]/70"
          : entry.seen
            ? "border-accent/20 bg-card/60 card-glow-observed"
            : "border-border/40 bg-card/60 card-glow hover:border-accent/40",
      )}
    >
      <div className="flex items-start justify-between">
        <span className="rounded bg-[oklch(0.14_0.06_245)] px-2 py-0.5 font-mono text-[10px] tracking-widest text-accent/80">
          #{String(entry.dexNumber).padStart(3, "0")}
        </span>
        <div className="flex items-center gap-1.5">
          {entry.isNew && (
            <Badge className="border-0 bg-[oklch(0.72_0.19_55)]/20 text-[oklch(0.72_0.19_55)] text-[10px] uppercase tracking-wider">
              New
            </Badge>
          )}
          {conservation && (
            <Badge
              className={cn("border-0 text-[9px] uppercase tracking-wider", conservation.className)}
            >
              {conservation.label}
            </Badge>
          )}
          <Badge className={cn("border-0 text-[10px] uppercase tracking-wider", rarity.className)}>
            {rarity.label}
          </Badge>
        </div>
      </div>

      <div className="mt-3 flex h-40 items-center justify-center overflow-hidden rounded-xl border border-border/30 bg-gradient-to-br from-[oklch(0.14_0.06_245)] to-[oklch(0.20_0.07_240)]">
        {entry.photoUrl ? (
          <img
            src={entry.photoUrl}
            alt={entry.commonName}
            className={cn(
              "h-full w-full object-cover transition-all",
              entry.seen
                ? "group-hover:scale-105"
                : "opacity-25 grayscale group-hover:opacity-100 group-hover:grayscale-0 group-hover:scale-105",
            )}
            loading="lazy"
          />
        ) : (
          <EyeOff
            className={cn(
              "transition-opacity",
              entry.seen
                ? "h-12 w-12 text-muted-foreground/30"
                : "h-12 w-12 text-muted-foreground/15",
            )}
          />
        )}
      </div>

      <div className="mt-5 flex-1">
        <h3 className="text-lg font-semibold leading-tight">
          {entry.commonName || entry.scientificName}
        </h3>
        <p className="mt-1 font-mono text-xs italic text-muted-foreground/80">
          {entry.scientificName}
        </p>
        {entry.maxLengthCm != null && entry.sizeTier && (
          <div className="mt-2 flex items-center gap-1.5">
            <span className="font-mono text-[9px] text-muted-foreground/40 leading-none tabular-nums">
              {entry.maxLengthCm} cm
            </span>
            <Fishspan maxLengthCm={entry.maxLengthCm} />
            <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground/40 leading-none">
              {entry.sizeTier.label}
            </span>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
        {entry.seen ? (
          <>
            <span className="flex items-center gap-1 truncate">
              <MapPin className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{entry.latestPlaceGuess}</span>
            </span>
            <span className="flex-shrink-0 rounded-full bg-[oklch(0.72_0.19_55)]/20 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-accent">
              {entry.userObsCount}x
            </span>
          </>
        ) : (
          <>
            <span className="flex items-center gap-1">
              <span className="font-mono text-[10px] text-muted-foreground/50">
                {entry.caribbeanObsCount.toLocaleString()} sightings
              </span>
            </span>
            <span className="rounded-full bg-accent/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-accent/70">
              unseen
            </span>
          </>
        )}
      </div>
    </button>
  );
}

function FishdexLoader() {
  return (
    <div className="mt-12 flex flex-col items-center justify-center py-16">
      <div className="relative">
        <div className="absolute inset-0 animate-ping rounded-full border-2 border-primary/20" />
        <div className="absolute inset-0 animate-pulse rounded-full border border-primary/30 [animation-delay:400ms]" />
        <div
          className="absolute inset-0 animate-pulse rounded-full border border-accent/20 [animation-delay:800ms]"
          style={{ margin: "-12px" }}
        />
        <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-[oklch(0.20_0.07_240)] to-[oklch(0.14_0.06_245)] ring-1 ring-primary/30 shadow-lg shadow-primary/10">
          <Fish className="h-10 w-10 animate-float text-primary/80" />
        </div>
      </div>

      <div className="mt-8 flex flex-col items-center gap-3">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-primary/60" />
          <span className="font-mono text-sm tracking-wider text-primary/80">Loading Fishdex</span>
        </div>
        <p className="font-mono text-[11px] text-muted-foreground/60">
          Fetching observation data from iNaturalist...
        </p>
      </div>

      <div className="mt-10 flex items-center gap-2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/70"
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
      </div>

      <div className="mt-8 flex gap-1.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-1 rounded-full bg-gradient-to-r from-primary/40 via-accent/30 to-primary/40 bg-[length:200%_100%]"
            style={{
              width: `${32 + i * 16}px`,
              animation: `shimmer 2s ease-in-out ${i * 0.2}s infinite`,
              opacity: 0.3 + i * 0.12,
            }}
          />
        ))}
      </div>

      <div className="mt-12 flex gap-6">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-accent/40"
            style={{
              animation: `bubble-rise 2s ease-out ${i * 0.6}s infinite`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mt-12 rounded-2xl border border-dashed border-border/50 bg-card/30 p-12 text-center">
      <Fish className="mx-auto h-10 w-10 text-muted-foreground/40" />
      <p className="mt-4 font-mono text-sm uppercase tracking-widest text-muted-foreground">
        No species match
      </p>
    </div>
  );
}

function ObservedDetailDialog({
  species,
  dexNumber,
  onClose,
  isNew,
}: {
  species: ObservedSpecies | null;
  dexNumber: number;
  onClose: () => void;
  isNew: boolean;
}) {
  const { data: observations = [], isLoading: obsLoading } = useSpeciesObservations(
    species?.taxonId,
  );

  return (
    <Dialog open={!!species} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl overflow-hidden border-border/60 bg-card/95 p-0 backdrop-blur-xl">
        {species && (
          <>
            <div className="scanline border-b border-border/50 bg-gradient-to-br from-[oklch(0.20_0.07_240)] to-[oklch(0.14_0.06_245)] px-6 py-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent/80">
                    #{String(dexNumber).padStart(3, "0")} · Seen ·{" "}
                    {species.caribbeanObsCount.toLocaleString()} Caribbean sightings
                  </p>
                  <DialogHeader className="mt-2">
                    <DialogTitle className="text-2xl font-bold text-glow">
                      {species.commonName}
                    </DialogTitle>
                    <DialogDescription className="font-mono text-sm italic text-muted-foreground">
                      {species.scientificName}
                    </DialogDescription>
                  </DialogHeader>
                </div>
                {species.photoUrl ? (
                  <img
                    src={species.photoUrl}
                    alt={species.commonName}
                    className="h-24 w-24 flex-shrink-0 rounded-xl border border-accent/30 object-cover shadow-lg ring-1 ring-accent/20"
                  />
                ) : (
                  <div className="flex h-24 w-24 items-center justify-center rounded-xl border border-primary/30 bg-primary/10">
                    <Fish className="h-10 w-10 text-primary/40" />
                  </div>
                )}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Badge className={cn("border-0", RARITY_META[species.rarity].className)}>
                  {RARITY_META[species.rarity].label} · {species.caribbeanObsCount.toLocaleString()}{" "}
                  Caribbean
                </Badge>
                {isNew && (
                  <Badge className="border-0 bg-[oklch(0.72_0.19_55)]/20 text-[oklch(0.72_0.19_55)] text-[10px] uppercase tracking-wider">
                    New
                  </Badge>
                )}
                {(() => {
                  const csStatus = formatConservationStatus(species.taxonId);
                  const cs = csStatus && CONSERVATION_META[csStatus];
                  if (!cs) return null;
                  return (
                    <Badge
                      className={cn("border-0 text-[10px] uppercase tracking-wider", cs.className)}
                    >
                      IUCN {cs.label}
                    </Badge>
                  );
                })()}
                <Badge variant="outline" className="border-border/60 bg-transparent">
                  You: {species.userObsCount}x
                </Badge>
                {(() => {
                  const sz = getSizeInfo(species.taxonId);
                  if (!sz) return null;
                  return (
                    <Badge variant="outline" className="border-border/60 bg-transparent">
                      <Fish className="mr-1 h-3 w-3" /> {sz.maxLengthCm} cm
                    </Badge>
                  );
                })()}
              </div>
            </div>

            <div className="max-h-[60vh] space-y-6 overflow-y-auto px-6 py-6">
              <Section label="Your Sightings">
                {obsLoading ? (
                  <div className="flex flex-col items-center gap-3 py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-primary/60" />
                    <p className="font-mono text-[11px] text-muted-foreground/70">
                      Loading observations...
                    </p>
                  </div>
                ) : observations.length > 0 ? (
                  <div className="space-y-2">
                    {observations.map((obs) => (
                      <ObservationRow key={obs.id} obs={obs} />
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground/70">No observations found.</p>
                )}

                <a
                  href={`https://www.inaturalist.org/observations?taxon_id=${species.taxonId}&user_id=${import.meta.env.VITE_INATURALIST_USERNAME}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1 font-mono text-[11px] text-primary/70 hover:text-primary"
                >
                  <ExternalLink className="h-3 w-3" /> View on iNaturalist
                </a>
              </Section>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MissingDetailDialog({
  species,
  dexNumber,
  onClose,
}: {
  species: CaribbeanSpecies | null;
  dexNumber: number;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!species} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl overflow-hidden border-border/60 bg-card/95 p-0 backdrop-blur-xl">
        {species && (
          <>
            <div className="scanline border-b border-border/50 bg-gradient-to-br from-[oklch(0.20_0.07_240)] to-[oklch(0.14_0.06_245)] px-6 py-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent/80">
                    #{String(dexNumber).padStart(3, "0")} · Unseen ·{" "}
                    {species.caribbeanObsCount.toLocaleString()} Caribbean
                  </p>
                  <DialogHeader className="mt-2">
                    <DialogTitle className="text-2xl font-bold text-glow">
                      {species.commonName}
                    </DialogTitle>
                    <DialogDescription className="font-mono text-sm italic text-muted-foreground">
                      {species.scientificName}
                    </DialogDescription>
                  </DialogHeader>
                </div>
                {species.photoUrl ? (
                  <img
                    src={species.photoUrl}
                    alt={species.commonName}
                    className="h-24 w-24 flex-shrink-0 rounded-xl border border-border/30 object-cover shadow-lg opacity-70"
                  />
                ) : (
                  <div className="flex h-24 w-24 items-center justify-center rounded-xl border border-primary/30 bg-primary/10">
                    <Fish className="h-10 w-10 text-primary/40" />
                  </div>
                )}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Badge className={cn("border-0", RARITY_META[species.rarity].className)}>
                  {RARITY_META[species.rarity].label}
                </Badge>
                {(() => {
                  const csStatus = formatConservationStatus(species.taxonId);
                  const cs = csStatus && CONSERVATION_META[csStatus];
                  if (!cs) return null;
                  return (
                    <Badge
                      className={cn("border-0 text-[10px] uppercase tracking-wider", cs.className)}
                    >
                      IUCN {cs.label}
                    </Badge>
                  );
                })()}
                <Badge variant="outline" className="border-border/60 bg-transparent">
                  {species.caribbeanObsCount.toLocaleString()} Caribbean sightings
                </Badge>
                {(() => {
                  const sz = getSizeInfo(species.taxonId);
                  if (!sz) return null;
                  return (
                    <Badge variant="outline" className="border-border/60 bg-transparent">
                      <Fish className="mr-1 h-3 w-3" /> {sz.maxLengthCm} cm
                    </Badge>
                  );
                })()}
              </div>
            </div>

            <div className="space-y-6 px-6 py-8">
              <p className="text-sm text-muted-foreground">
                You haven't logged this species on iNaturalist yet. It's been observed{" "}
                <span className="text-foreground">
                  {species.caribbeanObsCount.toLocaleString()} times
                </span>{" "}
                in the Caribbean — keep an eye out on your next dive.
              </p>

              <a
                href={`https://www.inaturalist.org/taxa/${species.taxonId}/browse_photos`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-mono text-[11px] text-primary/70 hover:text-primary"
              >
                <ExternalLink className="h-3 w-3" /> Browse photos on iNaturalist
              </a>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}

function ObservationRow({ obs }: { obs: INaturalistObservation }) {
  return (
    <a
      href={`https://www.inaturalist.org/observations/${obs.id}`}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 rounded-lg border border-border/40 bg-[oklch(0.14_0.06_245)]/30 px-3 py-3 transition-colors hover:border-primary/30 hover:bg-[oklch(0.16_0.06_245)]/40"
    >
      {obs.photoUrl ? (
        <img
          src={obs.photoUrl}
          alt={obs.speciesGuess ?? ""}
          className="h-10 w-10 flex-shrink-0 rounded-md border border-border/40 object-cover"
        />
      ) : (
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md border border-border/40 bg-primary/5">
          <Fish className="h-4 w-4 text-muted-foreground/40" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-foreground/90">
          {obs.speciesGuess ?? obs.userLogin}
        </p>
        <p className="mt-0.5 flex items-center gap-2 font-mono text-[10px] text-muted-foreground/70">
          <span>{new Date(obs.observedAt).toLocaleDateString()}</span>
          {obs.placeGuess && (
            <>
              <span>·</span>
              <span className="truncate">{obs.placeGuess}</span>
            </>
          )}
        </p>
      </div>
      <span className="font-mono text-[10px] text-muted-foreground/50">
        {new Date(obs.observedAt).toLocaleDateString()}
      </span>
    </a>
  );
}
