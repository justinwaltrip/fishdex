import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "fishdex.observed.v1";

export interface Observation {
  fishId: string;
  observedAt: string; // ISO date
  location?: string;
  notes?: string;
}

function read(): Record<string, Observation> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function write(data: Record<string, Observation>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function useObservedFish() {
  const [observations, setObservations] = useState<Record<string, Observation>>({});

  useEffect(() => {
    setObservations(read());
  }, []);

  const markObserved = useCallback((obs: Observation) => {
    setObservations((prev) => {
      const next = { ...prev, [obs.fishId]: obs };
      write(next);
      return next;
    });
  }, []);

  const unmark = useCallback((fishId: string) => {
    setObservations((prev) => {
      const next = { ...prev };
      delete next[fishId];
      write(next);
      return next;
    });
  }, []);

  return { observations, markObserved, unmark };
}
