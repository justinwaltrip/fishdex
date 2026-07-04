import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Check, Fish, MapPin, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  FISH_SPECIES,
  HABITAT_META,
  RARITY_META,
  type FishSpecies,
  type Habitat,
  type Rarity,
} from "@/lib/fish-data";
import { useObservedFish, type Observation } from "@/hooks/use-observed-fish";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Fishdex — Personal Fish Observation Log" },
      {
        name: "description",
        content:
          "A pokedex-style tracker for the fish species you've observed. Search, catalog, and hunt down new species.",
      },
      { property: "og:title", content: "Fishdex — Personal Fish Observation Log" },
      {
        property: "og:description",
        content: "Track observed fish species and hunt down the ones still missing from your dex.",
      },
    ],
  }),
  component: FishdexPage,
});

type FilterMode = "all" | "observed" | "unseen";

function FishdexPage() {
  const { observations, markObserved, unmark } = useObservedFish();
  const [query, setQuery] = useState("");
  const [habitat, setHabitat] = useState<Habitat | "all">("all");
  const [rarity, setRarity] = useState<Rarity | "all">("all");
  const [mode, setMode] = useState<FilterMode>("all");
  const [selected, setSelected] = useState<FishSpecies | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return FISH_SPECIES.filter((f) => {
      if (habitat !== "all" && f.habitat !== habitat) return false;
      if (rarity !== "all" && f.rarity !== rarity) return false;
      const seen = Boolean(observations[f.id]);
      if (mode === "observed" && !seen) return false;
      if (mode === "unseen" && seen) return false;
      if (!q) return true;
      return (
        f.commonName.toLowerCase().includes(q) ||
        f.scientificName.toLowerCase().includes(q) ||
        f.regions.some((r) => r.toLowerCase().includes(q))
      );
    });
  }, [query, habitat, rarity, mode, observations]);

  const total = FISH_SPECIES.length;
  const seenCount = Object.keys(observations).length;
  const completion = Math.round((seenCount / total) * 100);

  return (
    <div className="min-h-screen">
      <Header total={total} seenCount={seenCount} completion={completion} />

      <main className="mx-auto max-w-7xl px-4 pb-24 sm:px-6 lg:px-8">
        <FilterBar
          query={query}
          onQuery={setQuery}
          habitat={habitat}
          onHabitat={setHabitat}
          rarity={rarity}
          onRarity={setRarity}
          mode={mode}
          onMode={setMode}
        />

        <p className="mt-6 font-mono text-xs uppercase tracking-widest text-muted-foreground">
          {filtered.length} of {total} species
        </p>

        {filtered.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((fish) => (
              <FishCard
                key={fish.id}
                fish={fish}
                observed={Boolean(observations[fish.id])}
                onOpen={() => setSelected(fish)}
              />
            ))}
          </div>
        )}
      </main>

      <FishDetailDialog
        fish={selected}
        observation={selected ? observations[selected.id] : undefined}
        onClose={() => setSelected(null)}
        onMark={markObserved}
        onUnmark={unmark}
      />
    </div>
  );
}

function Header({
  total,
  seenCount,
  completion,
}: {
  total: number;
  seenCount: number;
  completion: number;
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
                  Field Log · v1
                </p>
                <h1 className="text-3xl font-bold text-glow sm:text-4xl">Fishdex</h1>
              </div>
            </div>
            <p className="mt-3 max-w-xl text-sm text-muted-foreground">
              A personal registry of the fish you've observed in the wild. Log new finds, chase down
              rarer species.
            </p>
          </div>

          <div className="rounded-xl border border-border/60 bg-card/60 p-4 card-glow sm:min-w-[260px]">
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Completion
              </span>
              <span className="font-mono text-xs text-primary">
                {seenCount} / {total}
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-[oklch(0.14_0.06_245)]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary to-[oklch(0.85_0.15_200)] transition-all duration-500"
                style={{ width: `${completion}%` }}
              />
            </div>
            <p className="mt-2 text-right font-mono text-2xl font-bold text-primary text-glow">
              {completion}
              <span className="text-sm text-muted-foreground">%</span>
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}

function FilterBar(props: {
  query: string;
  onQuery: (v: string) => void;
  habitat: Habitat | "all";
  onHabitat: (v: Habitat | "all") => void;
  rarity: Rarity | "all";
  onRarity: (v: Rarity | "all") => void;
  mode: FilterMode;
  onMode: (v: FilterMode) => void;
}) {
  return (
    <div className="mt-8 space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={props.query}
          onChange={(e) => props.onQuery(e.target.value)}
          placeholder="Search by name, scientific name, or region…"
          className="h-12 border-border/60 bg-card/50 pl-11 font-mono text-sm placeholder:text-muted-foreground/60"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <ChipGroup
          label="Status"
          value={props.mode}
          onChange={(v) => props.onMode(v as FilterMode)}
          options={[
            { value: "all", label: "All" },
            { value: "observed", label: "Observed" },
            { value: "unseen", label: "Unseen" },
          ]}
        />
        <Divider />
        <ChipGroup
          label="Habitat"
          value={props.habitat}
          onChange={(v) => props.onHabitat(v as Habitat | "all")}
          options={[
            { value: "all", label: "All" },
            ...Object.entries(HABITAT_META).map(([k, m]) => ({
              value: k,
              label: m.label,
            })),
          ]}
        />
        <Divider />
        <ChipGroup
          label="Rarity"
          value={props.rarity}
          onChange={(v) => props.onRarity(v as Rarity | "all")}
          options={[
            { value: "all", label: "All" },
            ...Object.entries(RARITY_META).map(([k, m]) => ({
              value: k,
              label: m.label,
            })),
          ]}
        />
      </div>
    </div>
  );
}

function Divider() {
  return <span className="mx-1 hidden h-6 w-px bg-border/60 sm:inline-block" />;
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

function FishCard({
  fish,
  observed,
  onOpen,
}: {
  fish: FishSpecies;
  observed: boolean;
  onOpen: () => void;
}) {
  const habitat = HABITAT_META[fish.habitat];
  const rarity = RARITY_META[fish.rarity];
  return (
    <button
      onClick={onOpen}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl border border-border/40 bg-card/60 p-5 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40",
        observed ? "card-glow-observed" : "card-glow",
      )}
    >
      <div className="flex items-start justify-between">
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          #{String(fish.dexNumber).padStart(3, "0")}
        </span>
        <Badge className={cn("border-0 text-[10px] uppercase tracking-wider", rarity.className)}>
          {rarity.label}
        </Badge>
      </div>

      <div
        className={cn(
          "mt-6 flex h-32 items-center justify-center rounded-xl border border-border/30 bg-gradient-to-br from-[oklch(0.14_0.06_245)] to-[oklch(0.20_0.07_240)] transition-all",
          observed ? "" : "grayscale",
        )}
      >
        <span
          className={cn(
            "text-6xl transition-all",
            observed ? "text-primary text-glow" : "text-muted-foreground/30 blur-[2px]",
          )}
          aria-hidden
        >
          {habitat.icon}
        </span>
      </div>

      <div className="mt-5 flex-1">
        <h3 className={cn("text-lg font-semibold leading-tight", !observed && "text-muted-foreground")}>
          {observed ? fish.commonName : "???"}
        </h3>
        <p className="mt-1 font-mono text-xs italic text-muted-foreground/80">
          {observed ? fish.scientificName : "— unidentified —"}
        </p>
      </div>

      <div className="mt-4 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          <span className="mr-1" aria-hidden>{habitat.icon}</span>
          {habitat.label}
        </span>
        {observed && (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-primary">
            <Check className="h-3 w-3" /> logged
          </span>
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
        No species match those filters
      </p>
    </div>
  );
}

function FishDetailDialog({
  fish,
  observation,
  onClose,
  onMark,
  onUnmark,
}: {
  fish: FishSpecies | null;
  observation: Observation | undefined;
  onClose: () => void;
  onMark: (obs: Observation) => void;
  onUnmark: (id: string) => void;
}) {
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");

  const observed = Boolean(observation);

  const handleMark = () => {
    if (!fish) return;
    onMark({
      fishId: fish.id,
      observedAt: new Date().toISOString(),
      location: location.trim() || undefined,
      notes: notes.trim() || undefined,
    });
    setLocation("");
    setNotes("");
  };

  return (
    <Dialog open={!!fish} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl overflow-hidden border-border/60 bg-card/95 p-0 backdrop-blur-xl">
        {fish && (
          <>
            <div className="scanline border-b border-border/50 bg-gradient-to-br from-[oklch(0.20_0.07_240)] to-[oklch(0.14_0.06_245)] px-6 py-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-primary/80">
                    Species · #{String(fish.dexNumber).padStart(3, "0")}
                  </p>
                  <DialogHeader className="mt-2">
                    <DialogTitle className="text-2xl font-bold text-glow">
                      {fish.commonName}
                    </DialogTitle>
                    <DialogDescription className="font-mono text-sm italic text-muted-foreground">
                      {fish.scientificName}
                    </DialogDescription>
                  </DialogHeader>
                </div>
                <div className="flex items-center justify-center rounded-xl border border-primary/30 bg-primary/10 p-4 text-4xl text-primary text-glow">
                  {HABITAT_META[fish.habitat].icon}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Badge className={cn("border-0", RARITY_META[fish.rarity].className)}>
                  {RARITY_META[fish.rarity].label}
                </Badge>
                <Badge variant="outline" className="border-border/60 bg-transparent">
                  {HABITAT_META[fish.habitat].label}
                </Badge>
                <Badge variant="outline" className="border-border/60 bg-transparent">
                  Max {fish.maxLengthCm} cm
                </Badge>
              </div>
            </div>

            <div className="max-h-[60vh] space-y-6 overflow-y-auto px-6 py-6">
              <Section label="Description">
                <p className="text-sm leading-relaxed text-foreground/90">{fish.description}</p>
              </Section>

              <div className="grid gap-4 sm:grid-cols-2">
                <Section label="Regions">
                  <ul className="space-y-1 text-sm">
                    {fish.regions.map((r) => (
                      <li key={r} className="flex items-center gap-2 text-foreground/90">
                        <MapPin className="h-3.5 w-3.5 text-primary/70" />
                        {r}
                      </li>
                    ))}
                  </ul>
                </Section>
                <Section label="Diet">
                  <p className="text-sm text-foreground/90">{fish.diet}</p>
                </Section>
              </div>

              <div className="rounded-lg border border-dashed border-border/50 bg-[oklch(0.14_0.06_245)]/40 p-3">
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  iNaturalist integration
                </p>
                <p className="mt-1 text-xs text-muted-foreground/80">
                  Placeholder — photos & nearby observations will load from api.inaturalist.org
                  {fish.iNaturalistTaxonId ? ` (taxon ${fish.iNaturalistTaxonId})` : ""}.
                </p>
              </div>

              {observed ? (
                <Section label="Your observation">
                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
                    <p className="font-mono text-xs text-primary">
                      Logged {new Date(observation!.observedAt).toLocaleDateString()}
                    </p>
                    {observation!.location && (
                      <p className="mt-1 text-sm">📍 {observation!.location}</p>
                    )}
                    {observation!.notes && (
                      <p className="mt-2 text-sm text-foreground/90">{observation!.notes}</p>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onUnmark(fish.id)}
                      className="mt-3 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      <X className="mr-1 h-3 w-3" /> Remove from dex
                    </Button>
                  </div>
                </Section>
              ) : (
                <Section label="Log an observation">
                  <div className="space-y-3">
                    <Input
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="Location (e.g. Lake Tahoe, CA)"
                      className="border-border/60 bg-background/40"
                    />
                    <Textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Notes — size, conditions, method…"
                      className="min-h-[80px] border-border/60 bg-background/40"
                    />
                    <Button onClick={handleMark} className="w-full">
                      <Check className="mr-2 h-4 w-4" /> Mark as observed
                    </Button>
                  </div>
                </Section>
              )}
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
