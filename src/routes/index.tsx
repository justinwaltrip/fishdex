import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useCallback } from "react";
import { Fish, MapPin, Search, ExternalLink, Eye, EyeOff } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
} from "@/hooks/use-inaturalist";
import {
  type ObservedSpecies,
  type CaribbeanSpecies,
  type INaturalistObservation,
} from "@/lib/inaturalist";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
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
  elasmobranch: "Sharks & Rays",
  turtle: "Turtles",
  cephalopod: "Cephalopods",
  gastropod: "Gastropods",
};

const RARITY_ORDER: Record<string, number> = {
  legendary: 0,
  rare: 1,
  uncommon: 2,
  common: 3,
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
  userObsCount: number;
  latestPlaceGuess: string;
}

function FishdexPage() {
  const { data: observed = [], isLoading: obsLoading } = useObservedSpecies();
  const { data: missing = [], isLoading: missLoading } = useMissingSpecies();
  const [query, setQuery] = useState("");
  const [rarityFilter, setRarityFilter] = useState<string>("all");
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [seenFilter, setSeenFilter] = useState<string>("all");
  const [selectedObserved, setSelectedObserved] = useState<ObservedSpecies | null>(null);
  const [selectedMissing, setSelectedMissing] = useState<CaribbeanSpecies | null>(null);
  const [selectedDexNumber, setSelectedDexNumber] = useState<number>(0);

  const isLoading = obsLoading || missLoading;

  const pokedex = useMemo(() => {
    const seenMap = new Map<number, ObservedSpecies>();
    for (const o of observed) {
      if (o.rarity !== "unknown") seenMap.set(o.taxonId, o);
    }

    const entries: PokedexEntry[] = [];

    for (const s of observed) {
      if (s.rarity === "unknown") continue;
      entries.push({
        taxonId: s.taxonId,
        dexNumber: 0,
        scientificName: s.scientificName,
        commonName: s.commonName,
        photoUrl: s.photoUrl,
        caribbeanObsCount: s.caribbeanObsCount,
        rarity: s.rarity,
        group: s.group,
        seen: true,
        userObsCount: s.userObsCount,
        latestPlaceGuess: s.latestPlaceGuess,
      });
    }

    for (const s of missing) {
      if (seenMap.has(s.taxonId)) continue;
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
        userObsCount: 0,
        latestPlaceGuess: "",
      });
    }

    entries.sort((a, b) => {
      if (a.rarity !== b.rarity) return RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity];
      if (a.seen !== b.seen) return a.seen ? -1 : 1;
      return b.caribbeanObsCount - a.caribbeanObsCount;
    });

    entries.forEach((e, i) => {
      e.dexNumber = i + 1;
    });

    return entries;
  }, [observed, missing]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pokedex.filter((s) => {
      if (rarityFilter !== "all" && s.rarity !== rarityFilter) return false;
      if (groupFilter !== "all" && s.group !== groupFilter) return false;
      if (seenFilter === "seen" && !s.seen) return false;
      if (seenFilter === "unseen" && s.seen) return false;
      if (!q) return true;
      return s.commonName.toLowerCase().includes(q) || s.scientificName.toLowerCase().includes(q);
    });
  }, [query, rarityFilter, groupFilter, seenFilter, pokedex]);

  const stats = useMemo(() => {
    const total = pokedex.length;
    const seen = pokedex.filter((s) => s.seen).length;
    const byRarity: Record<string, { seen: number; total: number }> = {};
    for (const r of Object.keys(RARITY_META)) {
      const all = pokedex.filter((s) => s.rarity === r);
      byRarity[r] = { seen: all.filter((s) => s.seen).length, total: all.length };
    }
    return { total, seen, byRarity };
  }, [pokedex]);

  const handleOpen = useCallback(
    (entry: PokedexEntry) => {
      setSelectedDexNumber(entry.dexNumber);
      if (entry.seen) {
        const obs = observed.find((o) => o.taxonId === entry.taxonId);
        if (obs) setSelectedObserved(obs);
      } else {
        const miss = missing.find((m) => m.taxonId === entry.taxonId);
        if (miss) setSelectedMissing(miss);
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
    <div className="min-h-screen">
      <PokedexHeader stats={stats} isLoading={isLoading} />

      <main className="mx-auto max-w-7xl px-4 pb-24 sm:px-6 lg:px-8">
        <FilterBar
          query={query}
          onQuery={setQuery}
          rarity={rarityFilter}
          onRarity={setRarityFilter}
          group={groupFilter}
          onGroup={setGroupFilter}
          seen={seenFilter}
          onSeen={setSeenFilter}
        />

        <p className="mt-6 font-mono text-xs uppercase tracking-widest text-muted-foreground">
          {filtered.length} of {pokedex.length} species
        </p>

        {isLoading ? (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-72 animate-pulse rounded-2xl border border-border/40 bg-card/40"
              />
            ))}
          </div>
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

      <ObservedDetailDialog
        species={selectedObserved}
        dexNumber={selectedDexNumber}
        onClose={handleClose}
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
  stats,
  isLoading,
}: {
  stats: { total: number; seen: number; byRarity: Record<string, { seen: number; total: number }> };
  isLoading: boolean;
}) {
  const rarityOrder = ["common", "uncommon", "rare", "legendary"];

  return (
    <header className="border-b border-border/50 bg-[oklch(0.14_0.06_245)]/60 backdrop-blur-xl">
      <div className="scanline">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:flex-row sm:items-end sm:justify-between sm:px-6 lg:px-8">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/15 ring-1 ring-primary/40 animate-float">
                <Fish className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-primary/80">
                  Caribbean · iNaturalist
                </p>
                <h1 className="text-3xl font-bold text-glow sm:text-4xl">Fishdex</h1>
              </div>
            </div>
            <p className="mt-3 max-w-xl text-sm text-muted-foreground">
              Track your Caribbean sightings — {stats.total} species, how many can you find?
            </p>
          </div>

          <div className="rounded-xl border border-border/60 bg-card/60 p-4 card-glow sm:min-w-[320px]">
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Caught
              </span>
              <span className="text-2xl font-bold tabular-nums text-glow">
                {isLoading ? "—" : stats.seen}
                <span className="ml-1 text-base font-normal text-muted-foreground">
                  / {isLoading ? "—" : stats.total}
                </span>
              </span>
            </div>

            <div className="mt-3 space-y-2">
              {rarityOrder.map((r) => {
                const { seen, total } = stats.byRarity[r] ?? {
                  seen: 0,
                  total: 0,
                };
                const pct = total > 0 ? (seen / total) * 100 : 0;
                const meta = RARITY_META[r];
                return (
                  <div key={r} className="flex items-center gap-2">
                    <span className="w-[5.5rem] font-mono text-[10px] text-muted-foreground">
                      {meta.label}
                    </span>
                    <div className="flex-1 h-1.5 rounded-full bg-[oklch(0.14_0.06_245)] overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${pct}%`,
                          backgroundColor:
                            r === "common"
                              ? "oklch(0.72 0.04 220)"
                              : r === "uncommon"
                                ? "oklch(0.65 0.15 155)"
                                : r === "rare"
                                  ? "oklch(0.78 0.18 195)"
                                  : "oklch(0.72 0.19 55)",
                        }}
                      />
                    </div>
                    <span className="w-12 text-right font-mono text-[10px] tabular-nums text-muted-foreground">
                      {seen}/{total}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

function FilterBar(props: {
  query: string;
  onQuery: (v: string) => void;
  rarity: string;
  onRarity: (v: string) => void;
  group: string;
  onGroup: (v: string) => void;
  seen: string;
  onSeen: (v: string) => void;
}) {
  return (
    <div className="mt-8 space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={props.query}
          onChange={(e) => props.onQuery(e.target.value)}
          placeholder="Search Caribbean species…"
          className="h-12 border-border/60 bg-card/50 pl-11 font-mono text-sm placeholder:text-muted-foreground/60"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <ChipGroup
          label="Seen"
          value={props.seen}
          onChange={props.onSeen}
          options={[
            { value: "all", label: "All" },
            { value: "seen", label: "Caught" },
            { value: "unseen", label: "Unseen" },
          ]}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
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

      <div className="flex flex-wrap items-center gap-2">
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
    <div className="flex items-center gap-1.5">
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

function PokedexCard({ entry, onOpen }: { entry: PokedexEntry; onOpen: () => void }) {
  const rarity = RARITY_META[entry.rarity];

  return (
    <button
      onClick={onOpen}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl border p-5 text-left transition-all hover:-translate-y-0.5",
        entry.seen
          ? "border-accent/20 bg-card/60 card-glow-observed"
          : "border-border/40 bg-card/60 card-glow hover:border-accent/40",
      )}
    >
      <div className="flex items-start justify-between">
        <span className="rounded bg-[oklch(0.14_0.06_245)] px-2 py-0.5 font-mono text-[10px] tracking-widest text-accent/80">
          #{String(entry.dexNumber).padStart(3, "0")}
        </span>
        <Badge className={cn("border-0 text-[10px] uppercase tracking-wider", rarity.className)}>
          {rarity.label}
        </Badge>
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
                : "opacity-25 grayscale group-hover:opacity-40 group-hover:scale-105",
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
}: {
  species: ObservedSpecies | null;
  dexNumber: number;
  onClose: () => void;
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
                    #{String(dexNumber).padStart(3, "0")} · Caught ·{" "}
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
                <Badge variant="outline" className="border-border/60 bg-transparent">
                  You: {species.userObsCount}x
                </Badge>
              </div>
            </div>

            <div className="max-h-[60vh] space-y-6 overflow-y-auto px-6 py-6">
              <Section label="Your Sightings">
                {obsLoading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 2 }).map((_, i) => (
                      <div
                        key={i}
                        className="flex animate-pulse items-center gap-3 rounded-lg border border-border/40 bg-[oklch(0.14_0.06_245)]/30 px-3 py-3"
                      >
                        <div className="h-10 w-10 rounded-md bg-primary/10" />
                        <div className="flex-1 space-y-1.5">
                          <div className="h-3 w-2/3 rounded bg-primary/10" />
                          <div className="h-2.5 w-1/2 rounded bg-muted/30" />
                        </div>
                      </div>
                    ))}
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
                  href={`https://www.inaturalist.org/observations?taxon_id=${species.taxonId}&user_id=jwaltrip`}
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
                <Badge variant="outline" className="border-border/60 bg-transparent">
                  {species.caribbeanObsCount.toLocaleString()} Caribbean sightings
                </Badge>
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
                href={`https://www.inaturalist.org/observations?taxon_id=${species.taxonId}&place_id=155104`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-mono text-[11px] text-primary/70 hover:text-primary"
              >
                <ExternalLink className="h-3 w-3" /> View Caribbean sightings on iNaturalist
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
