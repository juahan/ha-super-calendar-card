/** Shared test helpers: mock hass objects and API event fixtures. */
import type { ApiEvent, HassLike, TimeRange } from "../src/types";

export interface MockHassOptions {
  /** API events per entity. */
  eventsByEntity?: Record<string, ApiEvent[]>;
  /** Entities whose requests should reject. */
  failEntities?: string[];
  timeZone?: string;
  language?: string;
  timeFormat?: "12" | "24" | "language";
  friendlyNames?: Record<string, string>;
  /** Artificial latency per request (ms). */
  latencyMs?: number;
  connection?: HassLike["connection"];
}

export interface MockHass extends HassLike {
  /** Number of API calls per entity. */
  callCount: Record<string, number>;
  /** Every requested path, in order. */
  requestedPaths: string[];
  /** Shared connection identity for cache-sharing tests. */
  connection?: HassLike["connection"];
}

export function makeHass(options: MockHassOptions = {}): MockHass {
  const callCount: Record<string, number> = {};
  const requestedPaths: string[] = [];
  const states: Record<string, any> = {};
  for (const entity of Object.keys(options.eventsByEntity ?? {})) {
    states[entity] = {
      entity_id: entity,
      state: "on",
      attributes: { friendly_name: options.friendlyNames?.[entity] ?? entity },
    };
  }
  // Every configured entity exists even without events.
  for (const entity of Object.keys(options.friendlyNames ?? {})) {
    states[entity] ??= {
      entity_id: entity,
      state: "on",
      attributes: { friendly_name: options.friendlyNames![entity] },
    };
  }

  const hass: MockHass = {
    states,
    config: { time_zone: options.timeZone ?? "Europe/Helsinki" },
    language: options.language ?? "en",
    locale: {
      language: options.language ?? "en",
      time_format: options.timeFormat ?? "24",
    },
    callCount,
    requestedPaths,
    async callApi<T>(method: string, path: string): Promise<T> {
      if (method !== "GET") throw new Error(`Unexpected method ${method}`);
      requestedPaths.push(path);
      const match = /^calendars\/([^?]+)\?/.exec(path);
      const entity = match ? decodeURIComponent(match[1]!) : path;
      callCount[entity] = (callCount[entity] ?? 0) + 1;
      if (options.latencyMs) {
        await new Promise((resolve) => setTimeout(resolve, options.latencyMs));
      }
      if (options.failEntities?.includes(entity)) {
        throw new Error(`Request failed for ${entity}`);
      }
      return (options.eventsByEntity?.[entity] ?? []) as T;
    },
    ...(options.connection ? { connection: options.connection } : {}),
  };
  return hass;
}

/** Build a timed API event. */
export function timed(
  summary: string,
  start: string,
  end: string,
  extra: Partial<ApiEvent> = {}
): ApiEvent {
  return {
    summary,
    start: { dateTime: start },
    end: { dateTime: end },
    uid: extra.uid ?? `uid-${summary}-${start}`,
    ...extra,
  };
}

/** Build an all-day API event with an exclusive end date (HA semantics). */
export function allDay(
  summary: string,
  startDate: string,
  endDateExclusive: string,
  extra: Partial<ApiEvent> = {}
): ApiEvent {
  return {
    summary,
    start: { date: startDate },
    end: { date: endDateExclusive },
    uid: extra.uid ?? `uid-${summary}-${startDate}`,
    ...extra,
  };
}

/** Extract start/end timestamps from a request path (for range assertions). */
export function parseRequestedRange(path: string): TimeRange {
  const start = /start=([^&]+)/.exec(path);
  const end = /end=([^&]+)/.exec(path);
  return {
    startMs: Date.parse(decodeURIComponent(start![1]!)),
    endMs: Date.parse(decodeURIComponent(end![1]!)),
  };
}
