const KEY_PREFIX = "reef_recall_v2_obs_";

interface CacheEntry<T> {
  data: T;
  totalResults: number;
  fetchedAt: number;
}

export function getCached<T>(key: string, maxAgeMs: number): T | null {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + key);
    if (!raw) return null;
    const entry: CacheEntry<T> = JSON.parse(raw);
    if (Date.now() - entry.fetchedAt > maxAgeMs) return null;
    return entry.data;
  } catch {
    return null;
  }
}

export function setCached<T>(key: string, data: T, totalResults: number): void {
  try {
    const entry: CacheEntry<T> = {
      data,
      totalResults,
      fetchedAt: Date.now(),
    };
    localStorage.setItem(KEY_PREFIX + key, JSON.stringify(entry));
  } catch {
    /* localStorage full or unavailable */
  }
}

export function getCacheTotalResults(key: string): number | null {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry<unknown>;
    return entry.totalResults ?? null;
  } catch {
    return null;
  }
}

export function invalidateCache(key: string): void {
  try {
    localStorage.removeItem(KEY_PREFIX + key);
  } catch {
    /* ignore */
  }
}
