// Minimal in-memory TTL cache for expensive, short-lived read results.
//
// Pending paypoint data does not need sub-second freshness, so caching it for a
// handful of seconds collapses the repeated computation triggered by the
// Paypoint pages and any remaining pollers without changing what users see.

export interface TtlCache<T> {
  get(key: string): T | undefined;
  set(key: string, value: T): void;
  delete(key: string): void;
  clear(): void;
}

export function createTtlCache<T>(ttlMs: number): TtlCache<T> {
  const store = new Map<string, { value: T; expiresAt: number }>();
  return {
    get(key: string): T | undefined {
      const entry = store.get(key);
      if (!entry) return undefined;
      if (Date.now() > entry.expiresAt) {
        store.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set(key: string, value: T): void {
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
    },
    delete(key: string): void {
      store.delete(key);
    },
    clear(): void {
      store.clear();
    },
  };
}
