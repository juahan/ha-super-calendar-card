/**
 * Memory-only event cache (§15).
 *
 * - Scoped per Home Assistant connection, entity and range.
 * - Coalesces identical in-flight requests.
 * - Shared between card instances on the same page (one cache per connection).
 * - Bounded growth (50 cached range entries per connection, LRU eviction).
 * - Retains previous successful results while refreshing and after failures
 *   (marked stale). Old responses never overwrite newer ones.
 */
import { fetchCalendarEvents } from "./api";
import { rangeCovers, rangeKey } from "./ranges";
import type { ApiEvent, HassLike, TimeRange } from "./types";

export const MAX_CACHE_ENTRIES = 50;
export const DEFAULT_TTL_MS = 5 * 60 * 1000;

export type LoadStatus = "fresh" | "cached" | "stale" | "error";

export interface LoadResult {
  events: ApiEvent[];
  status: LoadStatus;
  /** Unix ms of the last successful request covering this range, if any. */
  lastRetrievedAt: number | null;
  error?: string;
}

interface CacheEntry {
  entityId: string;
  range: TimeRange;
  events: ApiEvent[];
  fetchedAt: number;
  lastAccess: number;
}

interface InflightRequest {
  entityId: string;
  range: TimeRange;
  promise: Promise<ApiEvent[]>;
}

export class ConnectionCache {
  private entries: CacheEntry[] = [];
  private inflight: InflightRequest[] = [];

  /**
   * Range requests are rounded to whole minutes so that drift in "now" between
   * card instances or refresh cycles still hits the same cache entry.
   */
  private static round(range: TimeRange): TimeRange {
    return {
      startMs: Math.floor(range.startMs / 60000) * 60000,
      endMs: Math.ceil(range.endMs / 60000) * 60000,
    };
  }

  /** Entries currently cached (for tests/diagnostics). */
  get size(): number {
    return this.entries.length;
  }

  /** Number of in-flight fetches (for tests/diagnostics). */
  get inflightCount(): number {
    return this.inflight.length;
  }

  private findCovering(entityId: string, range: TimeRange): CacheEntry | null {
    let best: CacheEntry | null = null;
    for (const entry of this.entries) {
      if (entry.entityId !== entityId) continue;
      if (!rangeCovers(entry.range, range)) continue;
      if (!best || entry.fetchedAt > best.fetchedAt) best = entry;
    }
    return best;
  }

  private findCoveringInflight(entityId: string, range: TimeRange): InflightRequest | null {
    let best: InflightRequest | null = null;
    for (const req of this.inflight) {
      if (req.entityId !== entityId) continue;
      if (!rangeCovers(req.range, range)) continue;
      if (!best || req.range.startMs < best.range.startMs) best = req;
    }
    return best;
  }

  private store(entityId: string, range: TimeRange, events: ApiEvent[], fetchedAt: number): void {
    // An older response must never overwrite a newer one for the same range.
    const existing = this.entries.find(
      (e) => e.entityId === entityId && rangeKey(e.range) === rangeKey(range)
    );
    if (existing) {
      if (existing.fetchedAt >= fetchedAt) {
        existing.lastAccess = Date.now();
        return;
      }
      existing.events = events;
      existing.fetchedAt = fetchedAt;
      existing.lastAccess = Date.now();
      return;
    }
    this.entries.push({ entityId, range: { ...range }, events, fetchedAt, lastAccess: Date.now() });
    this.evict();
  }

  private evict(): void {
    while (this.entries.length > MAX_CACHE_ENTRIES) {
      let oldestIdx = 0;
      for (let i = 1; i < this.entries.length; i += 1) {
        if (this.entries[i]!.lastAccess < this.entries[oldestIdx]!.lastAccess) oldestIdx = i;
      }
      this.entries.splice(oldestIdx, 1);
    }
  }

  private runFetch(hass: HassLike, entityId: string, range: TimeRange): Promise<ApiEvent[]> {
    const covering = this.findCoveringInflight(entityId, range);
    if (covering) return covering.promise;

    const promise = fetchCalendarEvents(hass, entityId, range)
      .then((events) => {
        this.store(entityId, range, events, Date.now());
        return events;
      })
      .finally(() => {
        const idx = this.inflight.findIndex((r) => r.promise === promise);
        if (idx >= 0) this.inflight.splice(idx, 1);
      });
    this.inflight.push({ entityId, range: { ...range }, promise });
    return promise;
  }

  /**
   * Load events for `range`.
   *
   * Fresh cache hits resolve without network. Stale entries trigger a refresh
   * but keep serving the previous result; on failure the previous result is
   * returned flagged `stale`.
   */
  async load(
    hass: HassLike,
    entityId: string,
    range: TimeRange,
    nowMs: number,
    options: { force?: boolean; ttlMs?: number } = {}
  ): Promise<LoadResult> {
    const ttl = options.ttlMs ?? DEFAULT_TTL_MS;
    const wanted = ConnectionCache.round(range);
    const cached = this.findCovering(entityId, wanted);

    if (cached && !options.force && nowMs - cached.fetchedAt <= ttl) {
      cached.lastAccess = Date.now();
      return {
        events: cached.events,
        status: "cached",
        lastRetrievedAt: cached.fetchedAt,
      };
    }

    try {
      const events = await this.runFetch(hass, entityId, wanted);
      return { events, status: "fresh", lastRetrievedAt: Date.now() };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      if (cached) {
        cached.lastAccess = Date.now();
        return { events: cached.events, status: "stale", lastRetrievedAt: cached.fetchedAt, error };
      }
      return { events: [], status: "error", lastRetrievedAt: null, error };
    }
  }

  /** Drop cached data for one entity (e.g. when it disappears from config). */
  invalidate(entityId?: string): void {
    if (entityId === undefined) {
      this.entries = [];
    } else {
      this.entries = this.entries.filter((e) => e.entityId !== entityId);
    }
  }
}

const caches = new WeakMap<object, ConnectionCache>();

/**
 * The cache shared by every card instance bound to the same Home Assistant
 * connection.
 */
export function getCacheForHass(hass: HassLike): ConnectionCache {
  const key = (hass.connection ?? hass) as object;
  let cache = caches.get(key);
  if (!cache) {
    cache = new ConnectionCache();
    caches.set(key, cache);
  }
  return cache;
}
