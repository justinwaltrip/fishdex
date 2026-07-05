import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Fish, MapPin, Search, ExternalLink, Compass, Eye, Layers } from "lucide-react";

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

type TabMode = "observed" | "missing";

const RARITY_META: Record<string, { label: string; className: string }> = {
  common: { label: "Common", className: "bg-muted text-muted-foreground" },
  uncommon: {
    label: "Uncommon",
    className: "bg-[oklch(0.65_0.15_155)] text-[oklch(0.15_0.05_240)]",
  },
  rare: { label: "Rare", className: "bg-primary text-primary-foreground" },
  legendary: { label: "Legendary", className: "bg-accent text-accent-foreground" },
};

const GROUP_LABELS: Record<string, string> = {
  fish: "Fish",
  crustacean: "Crustaceans",
  elasmobranch: "Sharks & Rays",
  turtle: "Turtles",
  cephalopod: "Cephalopods",
  gastropod: "Gastropods",
};

function FishdexPage() {
  const { data: observed = [], isLoading: obsLoading } = useObservedSpecies();
  const { data: missing = [], isLoading: missLoading } = useMissingSpecies();
  const [tab, setTab] = useState<TabMode>("observed");
  const [query, setQuery] = useState("");
  const [rarityFilter, setRarityFilter] = useState<string>("all");
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [selectedObserved, setSelectedObserved] = useState<ObservedSpecies | null>(null);
  const [selectedMissing, setSelectedMissing] = useState<CaribbeanSpecies | null>(null);

  const display = tab === "observed" ? observed : missing;
  const isLoading = tab === "observed" ? obsLoading : missLoading;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return display.filter((s) => {
      if (rarityFilter !== "all" && s.rarity !== rarityFilter) return false;
      if (groupFilter !== "all" && s.group !== groupFilter) return false;
      if (!q) return true;
      return s.commonName.toLowerCase().includes(q) || s.scientificName.toLowerCase().includes(q);
    });
  }, [query, rarityFilter, groupFilter, display]);

  const observedCount = observed.length;
  const missingCount = missing.length;

  return (
    <div className="min-h-screen">
      <Header
        observedCount={observedCount}
        missingCount={missingCount}
        tab={tab}
        onTab={setTab}
        isLoading={obsLoading || missLoading}
      />

      <main className="mx-auto max-w-7xl px-4 pb-24 sm:px-6 lg:px-8">
        <FilterBar
          query={query}
          onQuery={setQuery}
          rarity={rarityFilter}
          onRarity={setRarityFilter}
          group={groupFilter}
          onGroup={setGroupFilter}
          tab={tab}
        />

        <p className="mt-6 font-mono text-xs uppercase tracking-widest text-muted-foreground">
          {filtered.length} of {display.length} species
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
          <EmptyState tab={tab} />
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((s) =>
              tab === "observed" ? (
                <ObservedCard
                  key={s.taxonId}
                  species={s as ObservedSpecies}
                  onOpen={() => setSelectedObserved(s as ObservedSpecies)}
                />
              ) : (
                <MissingCard
                  key={s.taxonId}
                  species={s as CaribbeanSpecies}
                  onOpen={() => setSelectedMissing(s as CaribbeanSpecies)}
                />
              ),
            )}
          </div>
        )}
      </main>

      <ObservedDetailDialog species={selectedObserved} onClose={() => setSelectedObserved(null)} />
      <MissingDetailDialog species={selectedMissing} onClose={() => setSelectedMissing(null)} />
    </div>
  );
}

function Header({
  observedCount,
  missingCount,
  tab,
  onTab,
  isLoading,
}: {
  observedCount: number;
  missingCount: number;
  tab: TabMode;
  onTab: (t: TabMode) => void;
  isLoading: boolean;
}) {
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
              Caribbean reef fish. Track what you've seen and discover what's still out there.
            </p>
          </div>

          <div className="rounded-xl border border-border/60 bg-card/60 p-4 card-glow sm:min-w-[260px]">
            <div className="flex gap-2">
              <button
                onClick={() => onTab("observed")}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 font-mono text-xs uppercase tracking-wider transition-colors",
                  tab === "observed"
                    ? "bg-primary/15 text-primary ring-1 ring-primary/30"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Eye className="h-3.5 w-3.5" />
                Seen
                <span className="ml-1 rounded bg-[oklch(0.14_0.06_245)] px-1.5 py-0.5 text-[10px]">
                  {isLoading ? "—" : observedCount}
                </span>
              </button>
              <button
                onClick={() => onTab("missing")}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 font-mono text-xs uppercase tracking-wider transition-colors",
                  tab === "missing"
                    ? "bg-accent/15 text-accent ring-1 ring-accent/30"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Compass className="h-3.5 w-3.5" />
                Find
                <span className="ml-1 rounded bg-[oklch(0.14_0.06_245)] px-1.5 py-0.5 text-[10px]">
                  {isLoading ? "—" : missingCount}
                </span>
              </button>
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
  tab: TabMode;
}) {
  return (
    <div className="mt-8 space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={props.query}
          onChange={(e) => props.onQuery(e.target.value)}
          placeholder={
            props.tab === "observed" ? "Search observed species…" : "Search Caribbean species…"
          }
          className="h-12 border-border/60 bg-card/50 pl-11 font-mono text-sm placeholder:text-muted-foreground/60"
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

function ObservedCard({ species, onOpen }: { species: ObservedSpecies; onOpen: () => void }) {
  const rarity = species.rarity !== "unknown" ? RARITY_META[species.rarity] : null;
  return (
    <button
      onClick={onOpen}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-accent/20 bg-card/60 p-5 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 card-glow-observed"
    >
      <div className="flex items-start justify-between">
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {species.caribbeanObsCount > 0
            ? `${species.caribbeanObsCount.toLocaleString()} Caribbean`
            : `${species.taxonRank} rank`}
        </span>
        {rarity && (
          <Badge className={cn("border-0 text-[10px] uppercase tracking-wider", rarity.className)}>
            {rarity.label}
          </Badge>
        )}
      </div>

      <div className="mt-6 flex h-40 items-center justify-center overflow-hidden rounded-xl border border-border/30 bg-gradient-to-br from-[oklch(0.14_0.06_245)] to-[oklch(0.20_0.07_240)]">
        {species.photoUrl ? (
          <img
            src={species.photoUrl}
            alt={species.commonName}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <Fish className="h-12 w-12 text-muted-foreground/30" />
        )}
      </div>

      <div className="mt-5 flex-1">
        <h3 className="text-lg font-semibold leading-tight">{species.commonName}</h3>
        <p className="mt-1 font-mono text-xs italic text-muted-foreground/80">
          {species.scientificName}
        </p>
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <MapPin className="h-3 w-3" />
          {species.latestPlaceGuess}
        </span>
        <span className="rounded-full bg-accent/20 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-accent">
          {species.userObsCount}x
        </span>
      </div>
    </button>
  );
}

function MissingCard({ species, onOpen }: { species: CaribbeanSpecies; onOpen: () => void }) {
  const rarity = RARITY_META[species.rarity];
  return (
    <button
      onClick={onOpen}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-border/40 bg-card/60 p-5 text-left transition-all hover:-translate-y-0.5 hover:border-accent/40 card-glow"
    >
      <div className="flex items-start justify-between">
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {species.caribbeanObsCount.toLocaleString()} Caribbean
        </span>
        <Badge className={cn("border-0 text-[10px] uppercase tracking-wider", rarity.className)}>
          {rarity.label}
        </Badge>
      </div>

      <div className="mt-6 flex h-40 items-center justify-center overflow-hidden rounded-xl border border-border/30 bg-gradient-to-br from-[oklch(0.14_0.06_245)] to-[oklch(0.20_0.07_240)]">
        {species.photoUrl ? (
          <img
            src={species.photoUrl}
            alt={species.commonName}
            className="h-full w-full object-cover opacity-70 transition-all group-hover:scale-105 group-hover:opacity-100"
            loading="lazy"
          />
        ) : (
          <Fish className="h-12 w-12 text-muted-foreground/20" />
        )}
      </div>

      <div className="mt-5 flex-1">
        <h3 className="text-lg font-semibold leading-tight">{species.commonName}</h3>
        <p className="mt-1 font-mono text-xs italic text-muted-foreground/80">
          {species.scientificName}
        </p>
      </div>

      <div className="mt-4 flex items-center justify-end">
        <span className="rounded-full bg-accent/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-accent/70">
          to find
        </span>
      </div>
    </button>
  );
}

function EmptyState({ tab }: { tab: TabMode }) {
  return (
    <div className="mt-12 rounded-2xl border border-dashed border-border/50 bg-card/30 p-12 text-center">
      <Fish className="mx-auto h-10 w-10 text-muted-foreground/40" />
      <p className="mt-4 font-mono text-sm uppercase tracking-widest text-muted-foreground">
        {tab === "observed" ? "No species match" : "No species to find"}
      </p>
    </div>
  );
}

function ObservedDetailDialog({
  species,
  onClose,
}: {
  species: ObservedSpecies | null;
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
                    Observed ·{" "}
                    {species.caribbeanObsCount > 0
                      ? `${species.caribbeanObsCount.toLocaleString()} Caribbean sightings`
                      : `${species.taxonRank} rank`}
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
                {species.rarity !== "unknown" && (
                  <Badge className={cn("border-0", RARITY_META[species.rarity].className)}>
                    {RARITY_META[species.rarity].label} ·{" "}
                    {species.caribbeanObsCount.toLocaleString()} Caribbean
                  </Badge>
                )}
                {species.rarity === "unknown" && (
                  <Badge variant="outline" className="border-border/60 bg-transparent">
                    {species.taxonRank} rank
                  </Badge>
                )}
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
  onClose,
}: {
  species: CaribbeanSpecies | null;
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
                    To Find · {species.caribbeanObsCount.toLocaleString()} Caribbean
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
