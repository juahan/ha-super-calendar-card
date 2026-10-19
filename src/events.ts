/**
 * Event normalization, identity, sorting and selection (§9, §13).
 *
 * Pure functions. Events coming from the Home Assistant calendar API are
 * treated as already-expanded occurrences; recurrence is never re-expanded here.
 */
import { DateTime } from "luxon";
import {
  dateToKey,
  keyToDate,
  keyFromMillis,
  todayKey,
} from "./dates";
import type { ApiDateValue, ApiEvent, CalendarEvent, SourceConfig, TimeRange } from "./types";

export const UNTITLED_EVENT = "Untitled event.";

/** Display title with the §11 fallback for missing titles. */
export function displayTitle(event: CalendarEvent): string {
  return event.title.trim() !== "" ? event.title : UNTITLED_EVENT;
}

/** FNV-1a hash for deterministic identities. */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function dateValueToString(value: ApiDateValue | string | null | undefined): {
  kind: "date" | "dateTime" | null;
  text: string | null;
} {
  if (value === null || value === undefined) return { kind: null, text: null };
  if (typeof value === "string") return { kind: "dateTime", text: value };
  if (typeof value === "object") {
    if (typeof value.date === "string") return { kind: "date", text: value.date };
    if (typeof value.dateTime === "string") return { kind: "dateTime", text: value.dateTime };
  }
  return { kind: null, text: null };
}

function isValidDayKey(key: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const dt = DateTime.fromISO(key, { zone: "UTC" });
  return dt.isValid && dt.toFormat("yyyy-MM-dd") === key;
}

export interface NormalizeResult {
  events: CalendarEvent[];
  /** Warnings for malformed events that were skipped (§13). */
  warnings: string[];
}

/**
 * Normalize API events for one source into the spec's `CalendarEvent` shape.
 * Malformed events are skipped with a warning instead of crashing the card.
 */
export function normalizeApiEvents(
  rawEvents: ApiEvent[],
  source: SourceConfig,
  zone: string
): NormalizeResult {
  const events: CalendarEvent[] = [];
  const warnings: string[] = [];

  rawEvents.forEach((raw, index) => {
    const where = `${source.entity} event ${index + 1}`;
    const start = dateValueToString(raw?.start);
    const end = dateValueToString(raw?.end);
    if (!start.kind || !start.text || !end.kind || !end.text) {
      warnings.push(`${where}: missing or unreadable start/end; skipped.`);
      return;
    }
    if (start.kind !== end.kind) {
      warnings.push(`${where}: start and end mix date and dateTime; skipped.`);
      return;
    }

    const title = typeof raw.summary === "string" ? raw.summary.trim() : "";
    const location = typeof raw.location === "string" && raw.location.trim() !== "" ? raw.location.trim() : undefined;
    const description =
      typeof raw.description === "string" && raw.description.trim() !== ""
        ? raw.description.trim()
        : undefined;

    if (start.kind === "date") {
      if (!isValidDayKey(start.text) || !isValidDayKey(end.text)) {
        warnings.push(`${where}: invalid date-only start/end; skipped.`);
        return;
      }
      const startDate = start.text;
      let endDateExclusive = end.text;
      if (endDateExclusive <= startDate) {
        // Zero-duration all-day event: show it on its start day (§13).
        endDateExclusive = dateToKey(keyToDate(startDate, zone).plus({ days: 1 }));
      }
      const id = buildEventId(source.id, raw, `d:${startDate}|${endDateExclusive}`, title, location, description);
      events.push({ id, sourceId: source.id, title, location, description, allDay: true, startDate, endDateExclusive });
      return;
    }

    const startDt = DateTime.fromISO(start.text, { zone });
    const endDt = DateTime.fromISO(end.text, { zone });
    if (!startDt.isValid || !endDt.isValid) {
      warnings.push(`${where}: invalid dateTime start/end; skipped.`);
      return;
    }
    const startMs = startDt.toMillis();
    let endMs = endDt.toMillis();
    if (endMs < startMs) {
      warnings.push(`${where}: end precedes start; skipped.`);
      return;
    }
    if (endMs === startMs) {
      // Zero-duration timed event: represented by its start time (§13).
      endMs = startMs;
    }
    const id = buildEventId(source.id, raw, `t:${startMs}|${endMs}`, title, location, description);
    events.push({ id, sourceId: source.id, title, location, description, allDay: false, startMs, endMs });
  });

  return { events, warnings };
}

function buildEventId(
  sourceId: string,
  raw: ApiEvent,
  startEndKey: string,
  title: string,
  location: string | undefined,
  description: string | undefined
): string {
  const uid = typeof raw.uid === "string" && raw.uid !== "" ? raw.uid : null;
  const recurrenceId = typeof raw.recurrence_id === "string" && raw.recurrence_id !== "" ? raw.recurrence_id : null;
  if (uid) {
    // Prefer UID plus occurrence identity when available (§13).
    return `${sourceId}::${uid}::${recurrenceId ?? ""}::${startEndKey}`;
  }
  const fingerprint = [sourceId, startEndKey, title, location ?? "", description ?? ""].join("\u0000");
  return `${sourceId}::gen-${fnv1a(fingerprint)}`;
}

/** Deduplicate overlapping request results within a single source (§13). */
export function dedupeWithinSource(events: CalendarEvent[]): CalendarEvent[] {
  const seen = new Map<string, CalendarEvent>();
  for (const event of events) {
    const key = `${event.sourceId}\u0000${event.id}`;
    if (!seen.has(key)) {
      seen.set(key, event);
    }
  }
  return [...seen.values()];
}

// ---------------------------------------------------------------------------
// Instants and interval semantics (start-inclusive, end-exclusive)
// ---------------------------------------------------------------------------

/** Effective start instant; all-day events use local midnight in the display zone. */
export function effectiveStartMs(event: CalendarEvent, zone: string): number {
  return event.allDay ? keyToDate(event.startDate, zone).toMillis() : event.startMs;
}

/** End instant (exclusive). */
export function endMsExclusive(event: CalendarEvent, zone: string): number {
  return event.allDay ? keyToDate(event.endDateExclusive, zone).toMillis() : event.endMs;
}

/**
 * End used for overlap tests. Zero-duration events are represented by their
 * start time, so they still occupy their start day (§13).
 */
export function overlapEndMs(event: CalendarEvent, zone: string): number {
  const end = endMsExclusive(event, zone);
  const start = effectiveStartMs(event, zone);
  return end > start ? end : start + 1;
}

/** Does the occurrence overlap the half-open day `[dayStart, dayStart+1d)`? */
export function occursOnDay(event: CalendarEvent, dayKey: string, zone: string): boolean {
  const dayStart = keyToDate(dayKey, zone).toMillis();
  const dayEnd = keyToDate(dayKey, zone).plus({ days: 1 }).toMillis();
  return effectiveStartMs(event, zone) < dayEnd && overlapEndMs(event, zone) > dayStart;
}

/** Does the occurrence overlap the half-open range `[startMs, endMs)`? */
export function overlapsRange(event: CalendarEvent, range: TimeRange, zone: string): boolean {
  return effectiveStartMs(event, zone) < range.endMs && overlapEndMs(event, zone) > range.startMs;
}

/** Ongoing per §9. */
export function isOngoing(event: CalendarEvent, nowMs: number, zone: string): boolean {
  if (event.allDay) {
    const today = todayKey(nowMs, zone);
    return event.startDate <= today && today < event.endDateExclusive;
  }
  return event.startMs <= nowMs && nowMs < event.endMs;
}

/** Completed (ended before now); completed events are excluded from upcoming (§9). */
export function isCompleted(event: CalendarEvent, nowMs: number, zone: string): boolean {
  return overlapEndMs(event, zone) <= nowMs;
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

export type SourceOrder = Map<string, number>;

export function sourceOrderFrom(sources: Pick<SourceConfig, "id">[]): SourceOrder {
  return new Map(sources.map((s, i) => [s.id, i]));
}

function compareByStartThenSourceThenTitleThenId(
  a: CalendarEvent,
  b: CalendarEvent,
  zone: string,
  order: SourceOrder
): number {
  const startDiff = effectiveStartMs(a, zone) - effectiveStartMs(b, zone);
  if (startDiff !== 0) return startDiff;
  const orderDiff = (order.get(a.sourceId) ?? 0) - (order.get(b.sourceId) ?? 0);
  if (orderDiff !== 0) return orderDiff;
  const titleDiff = displayTitle(a).localeCompare(displayTitle(b));
  if (titleDiff !== 0) return titleDiff;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Grid/agenda sorting (§13): all-day first, then start, source order, title, ID.
 */
export function sortForCalendar(
  events: CalendarEvent[],
  zone: string,
  order: SourceOrder
): CalendarEvent[] {
  return [...events].sort((a, b) => {
    if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
    return compareByStartThenSourceThenTitleThenId(a, b, zone, order);
  });
}

/**
 * Upcoming sorting (§9): effective start instant (local midnight for all-day),
 * source order, title, ID. All-day events do NOT all sort before timed events.
 */
export function sortForUpcoming(
  events: CalendarEvent[],
  zone: string,
  order: SourceOrder
): CalendarEvent[] {
  return [...events].sort((a, b) => compareByStartThenSourceThenTitleThenId(a, b, zone, order));
}

// ---------------------------------------------------------------------------
// Selection for the upcoming list (§9) and the selected-week list (§10)
// ---------------------------------------------------------------------------

export interface UpcomingQuery {
  nowMs: number;
  zone: string;
  /** `upcoming.max_events`. */
  maxEvents: number;
  /** `upcoming.lookahead_days`. */
  lookaheadDays: number;
  /** `upcoming.include_ongoing`. */
  includeOngoing: boolean;
}

/** End of the upcoming horizon: same local time `lookaheadDays` calendar days ahead (§9). */
export function horizonEndMs(nowMs: number, zone: string, lookaheadDays: number): number {
  return DateTime.fromMillis(nowMs, { zone }).plus({ days: lookaheadDays }).toMillis();
}

/**
 * Select upcoming events: next `maxEvents` occurrences from now until the
 * horizon. Never searches beyond the horizon to fill the list (§9).
 */
export function selectUpcoming(
  events: CalendarEvent[],
  order: SourceOrder,
  query: UpcomingQuery
): CalendarEvent[] {
  const { nowMs, zone, maxEvents, lookaheadDays, includeOngoing } = query;
  const horizonEnd = horizonEndMs(nowMs, zone, lookaheadDays);
  const today = todayKey(nowMs, zone);

  const candidates = events.filter((event) => {
    if (isCompleted(event, nowMs, zone)) return false;
    if (effectiveStartMs(event, zone) >= horizonEnd) return false;
    if (!includeOngoing) {
      if (event.allDay) {
        if (event.startDate < today) return false;
      } else if (event.startMs < nowMs) {
        return false;
      }
    }
    return true;
  });

  return sortForUpcoming(candidates, zone, order).slice(0, maxEvents);
}

export interface WeekSelectionQuery {
  /** Half-open week window in UTC epoch ms. */
  range: TimeRange;
  zone: string;
  maxEvents: number;
}

export interface WeekSelectionResult {
  events: CalendarEvent[];
  /** Total occurrences overlapping the week before `max_events` is applied (§10). */
  total: number;
}

/**
 * Events overlapping the selected week. Completed events in the week are kept
 * (§10) and `upcoming.max_events` is applied to the displayed list.
 */
export function selectWeekEvents(
  events: CalendarEvent[],
  order: SourceOrder,
  query: WeekSelectionQuery
): WeekSelectionResult {
  const overlapping = events.filter((event) => overlapsRange(event, query.range, query.zone));
  const sorted = sortForUpcoming(overlapping, query.zone, order);
  return {
    events: sorted.slice(0, query.maxEvents),
    total: sorted.length,
  };
}

/** Events shown on a grid/agenda day cell. */
export function eventsForDay(
  events: CalendarEvent[],
  dayKey: string,
  zone: string,
  order: SourceOrder
): CalendarEvent[] {
  return sortForCalendar(
    events.filter((event) => occursOnDay(event, dayKey, zone)),
    zone,
    order
  );
}

/** Day keys overlapped by an occurrence (multi-day display, §13). */
export function dayKeysOfEvent(event: CalendarEvent, zone: string): string[] {
  const startMs = effectiveStartMs(event, zone);
  const endMs = Math.max(overlapEndMs(event, zone), startMs + 1);
  const keys: string[] = [];
  let cursorMs = startMs;
  // Guard against pathological spans; rendered spans are bounded by view ranges.
  for (let i = 0; i < 1000 && cursorMs < endMs; i += 1) {
    keys.push(keyFromMillis(cursorMs, zone));
    cursorMs = keyToDate(keyFromMillis(cursorMs, zone), zone).plus({ days: 1 }).toMillis();
  }
  return keys;
}
