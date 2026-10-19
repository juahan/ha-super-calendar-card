/**
 * Home Assistant calendar API adapter (§12).
 *
 * Uses the authenticated calendar REST API through `hass.callApi` following the
 * Home Assistant frontend path conventions:
 *
 *   GET /api/calendars/{entity_id}?start={timestamp}&end={timestamp}
 *
 * Returned events are treated as already-expanded occurrences. Recurrence is
 * never re-expanded here. No user token is requested.
 */
import type { ApiEvent, HassLike, TimeRange } from "./types";

export function isoTimestamp(ms: number): string {
  return new Date(ms).toISOString();
}

export function calendarEventsPath(entityId: string, range: TimeRange): string {
  const start = encodeURIComponent(isoTimestamp(range.startMs));
  const end = encodeURIComponent(isoTimestamp(range.endMs));
  return `calendars/${encodeURIComponent(entityId)}?start=${start}&end=${end}`;
}

/**
 * Fetch events for one source and one range. Sources are requested
 * independently so that failures stay isolated (§12).
 */
export async function fetchCalendarEvents(
  hass: HassLike,
  entityId: string,
  range: TimeRange
): Promise<ApiEvent[]> {
  const result = await hass.callApi<unknown>("GET", calendarEventsPath(entityId, range));
  if (!Array.isArray(result)) {
    throw new Error(`Unexpected response for ${entityId}: expected a list of events.`);
  }
  return result as ApiEvent[];
}

export interface ConnectionTestResult {
  ok: boolean;
  /** Number of events returned; an empty successful result is valid (§16). */
  eventCount?: number;
  error?: string;
}

/**
 * Editor "source connection test" (§16). Uses the same adapter as the card.
 * An empty successful result is a valid connection.
 */
export async function testSourceConnection(
  hass: HassLike,
  entityId: string,
  nowMs: number
): Promise<ConnectionTestResult> {
  const range: TimeRange = { startMs: nowMs, endMs: nowMs + 24 * 60 * 60 * 1000 };
  try {
    const events = await fetchCalendarEvents(hass, entityId, range);
    return { ok: true, eventCount: events.length };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
