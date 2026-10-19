/**
 * Event label formatting (§11). Pure functions shared by all views.
 */
import { DateTime } from "luxon";
import { formatDate, formatRelativeRowLabel, formatTime, keyFromMillis, type FormatContext } from "./dates";
import { STRINGS } from "./strings";
import type { CalendarEvent, CardConfig } from "./types";

/** Time label for a row: "18:30" / "6:30 PM" / "All day". */
export function eventTimeLabel(event: CalendarEvent, fmt: FormatContext): string {
  return event.allDay ? STRINGS.allDay : formatTime(event.startMs, fmt);
}

/** End-time label used with `show_end_time`; null for all-day events. */
export function eventEndTimeLabel(event: CalendarEvent, fmt: FormatContext): string | null {
  return event.allDay ? null : formatTime(event.endMs, fmt);
}

/** Local date key of the event's effective start in the display timezone. */
export function eventDayKey(event: CalendarEvent, fmt: FormatContext): string {
  return event.allDay ? event.startDate : keyFromMillis(event.startMs, fmt.zone);
}

/**
 * Upcoming-list label: relative (§11 table) or absolute localized date+time.
 * The year is included in absolute mode only when it differs from the current
 * year.
 */
export function upcomingRowLabel(
  event: CalendarEvent,
  config: CardConfig,
  fmt: FormatContext
): string {
  const dayKey = eventDayKey(event, fmt);
  const timeLabel = eventTimeLabel(event, fmt);
  if (config.upcoming.date_format === "relative") {
    return formatRelativeRowLabel(dayKey, timeLabel, fmt);
  }
  return `${formatDate(dayKey, fmt, "auto")} · ${timeLabel}`;
}

/** Whether an occurrence spans more than one day (shown once in the list). */
export function isMultiDay(event: CalendarEvent, fmt: FormatContext): boolean {
  if (event.allDay) {
    const nextDay = DateTime.fromISO(event.startDate, { zone: "UTC" }).plus({ days: 1 });
    return event.endDateExclusive > nextDay.toFormat("yyyy-MM-dd");
  }
  return (
    keyFromMillis(event.startMs, fmt.zone) !==
    keyFromMillis(Math.max(event.endMs - 1, event.startMs), fmt.zone)
  );
}
