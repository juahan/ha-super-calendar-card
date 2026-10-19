import { describe, expect, it } from "vitest";
import { ConnectionCache, MAX_CACHE_ENTRIES, getCacheForHass } from "../src/cache";
import { makeHass, timed } from "./helpers";
import type { TimeRange } from "../src/types";

const range: TimeRange = { startMs: 0, endMs: 1000 };

describe("cache (§15)", () => {
  it("serves fresh results from cache without a new request", async () => {
    const hass = makeHass({
      eventsByEntity: { "calendar.a": [timed("A", "2026-10-19T10:00:00", "2026-10-19T11:00:00")] },
    });
    const cache = new ConnectionCache();
    const first = await cache.load(hass, "calendar.a", range, 0);
    expect(first.status).toBe("fresh");
    const second = await cache.load(hass, "calendar.a", range, 0);
    expect(second.status).toBe("cached");
    expect(second.events).toEqual(first.events);
    expect(hass.callCount["calendar.a"]).toBe(1);
  });

  it("coalesces identical in-flight requests", async () => {
    const hass = makeHass({
      latencyMs: 20,
      eventsByEntity: { "calendar.a": [timed("A", "2026-10-19T10:00:00", "2026-10-19T11:00:00")] },
    });
    const cache = new ConnectionCache();
    const [a, b, c] = await Promise.all([
      cache.load(hass, "calendar.a", range, 0),
      cache.load(hass, "calendar.a", range, 0),
      cache.load(hass, "calendar.a", range, 0),
    ]);
    expect(hass.callCount["calendar.a"]).toBe(1);
    expect(a.events).toEqual(b.events);
    expect(b.events).toEqual(c.events);
  });

  it("coalesces requests covered by an in-flight larger range", async () => {
    const hass = makeHass({ latencyMs: 20, eventsByEntity: { "calendar.a": [] } });
    const cache = new ConnectionCache();
    const big: TimeRange = { startMs: 0, endMs: 5000 };
    const small: TimeRange = { startMs: 100, endMs: 200 };
    await Promise.all([cache.load(hass, "calendar.a", big, 0), cache.load(hass, "calendar.a", small, 0)]);
    expect(hass.callCount["calendar.a"]).toBe(1);
  });

  it("reuses results that cover the requested range", async () => {
    const hass = makeHass({ eventsByEntity: { "calendar.a": [] } });
    const cache = new ConnectionCache();
    await cache.load(hass, "calendar.a", { startMs: 0, endMs: 5000 }, 0);
    await cache.load(hass, "calendar.a", { startMs: 1000, endMs: 2000 }, 0);
    expect(hass.callCount["calendar.a"]).toBe(1);
  });

  it("refetches when forced (manual refresh)", async () => {
    const hass = makeHass({ eventsByEntity: { "calendar.a": [] } });
    const cache = new ConnectionCache();
    await cache.load(hass, "calendar.a", range, 0);
    await cache.load(hass, "calendar.a", range, 0, { force: true });
    expect(hass.callCount["calendar.a"]).toBe(2);
  });

  it("refetches when the TTL expires", async () => {
    const hass = makeHass({ eventsByEntity: { "calendar.a": [] } });
    const cache = new ConnectionCache();
    const t = Date.now();
    await cache.load(hass, "calendar.a", range, t);
    await cache.load(hass, "calendar.a", range, t + 10 * 60 * 1000); // 10 min later > 5 min TTL
    expect(hass.callCount["calendar.a"]).toBe(2);
  });

  it("retains previous results and marks them stale after a failure", async () => {
    const events = [timed("A", "2026-10-19T10:00:00", "2026-10-19T11:00:00")];
    const hass = makeHass({ eventsByEntity: { "calendar.a": events } });
    const cache = new ConnectionCache();
    await cache.load(hass, "calendar.a", range, 0);
    (hass as any).callApi = async () => {
      throw new Error("boom");
    };
    const result = await cache.load(hass, "calendar.a", range, 0, { force: true });
    expect(result.status).toBe("stale");
    expect(result.events).toHaveLength(1);
    expect(result.error).toMatch(/boom/);
    expect(result.lastRetrievedAt).not.toBeNull();
  });

  it("reports error when there is no cached data", async () => {
    const hass = makeHass({ failEntities: ["calendar.a"] });
    const cache = new ConnectionCache();
    const result = await cache.load(hass, "calendar.a", range, 0);
    expect(result.status).toBe("error");
    expect(result.events).toEqual([]);
    expect(result.lastRetrievedAt).toBeNull();
    expect(result.error).toBeTruthy();
  });

  it("isolates failures per entity", async () => {
    const hass = makeHass({
      failEntities: ["calendar.bad"],
      eventsByEntity: { "calendar.good": [timed("G", "2026-10-19T10:00:00", "2026-10-19T11:00:00")] },
    });
    const cache = new ConnectionCache();
    const bad = await cache.load(hass, "calendar.bad", range, 0);
    const good = await cache.load(hass, "calendar.good", range, 0);
    expect(bad.status).toBe("error");
    expect(good.status).toBe("fresh");
    expect(good.events).toHaveLength(1);
  });

  it("keeps range data isolated when requests complete out of order", async () => {
    // Two disjoint ranges for the same entity resolve in reverse order and
    // must not leak into each other's cache entries. Ranges are minute-aligned
    // so they do not collapse into one cache entry.
    const cache = new ConnectionCache();
    const rangeA: TimeRange = { startMs: 0, endMs: 60000 };
    const rangeB: TimeRange = { startMs: 120000, endMs: 180000 };
    let resolveA: ((value: any) => void) | null = null;
    let call = 0;
    const hass: any = {
      states: {},
      callApi: (_m: string, _path: string) => {
        call += 1;
        if (call === 1) {
          return new Promise((resolve) => {
            resolveA = resolve;
          });
        }
        return Promise.resolve([timed("b", "2026-10-20T10:00:00", "2026-10-20T11:00:00")]);
      },
    };
    const first = cache.load(hass, "calendar.a", rangeA, 0);
    const second = cache.load(hass, "calendar.a", rangeB, 0);
    await second;
    resolveA!([timed("a", "2026-10-19T10:00:00", "2026-10-19T11:00:00")]);
    await first;
    const a = await cache.load(hass, "calendar.a", rangeA, 0);
    const b = await cache.load(hass, "calendar.a", rangeB, 0);
    expect(a.events[0]!.summary).toBe("a");
    expect(b.events[0]!.summary).toBe("b");
  });

  it("bounds growth with LRU eviction", async () => {
    const hass = makeHass({ eventsByEntity: { "calendar.a": [] } });
    const cache = new ConnectionCache();
    for (let i = 0; i < MAX_CACHE_ENTRIES + 25; i += 1) {
      await cache.load(hass, "calendar.a", { startMs: i * 10, endMs: i * 10 + 5 }, 0);
    }
    expect(cache.size).toBeLessThanOrEqual(MAX_CACHE_ENTRIES);
  });

  it("shares one cache per Home Assistant connection across card instances", () => {
    const connection = {
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    const hassA = makeHass({ connection });
    const hassB = makeHass({ connection });
    const hassC = makeHass({});
    expect(getCacheForHass(hassA)).toBe(getCacheForHass(hassB));
    expect(getCacheForHass(hassA)).not.toBe(getCacheForHass(hassC));
  });

  it("invalidates per entity or fully", async () => {
    const hass = makeHass({ eventsByEntity: { "calendar.a": [], "calendar.b": [] } });
    const cache = new ConnectionCache();
    await cache.load(hass, "calendar.a", range, 0);
    await cache.load(hass, "calendar.b", range, 0);
    cache.invalidate("calendar.a");
    await cache.load(hass, "calendar.a", range, 0);
    expect(hass.callCount["calendar.a"]).toBe(2);
    await cache.load(hass, "calendar.b", range, 0);
    expect(hass.callCount["calendar.b"]).toBe(1);
    cache.invalidate();
    await cache.load(hass, "calendar.b", range, 0);
    expect(hass.callCount["calendar.b"]).toBe(2);
  });
});
