/**
 * Date arithmetic and formatting (§7, §11, §14).
 *
 * Pure functions with explicit timezone handling. All arithmetic is calendar
 * aware (Luxon), never fixed 24-hour additions. "Now" is always injected, so
 * behavior is deterministic and testable.
 */
import { DateTime } from "luxon";
import type { DisplayTimeFormat, TimeFormatSetting, TimezoneSetting } from "./types";

export type FirstDay = "monday" | "sunday";

/** Everything formatting needs; built by the card from hass + config. */
export interface FormatContext {
  /** IANA display timezone. */
  zone: string;
  /** BCP-47 language tag, e.g. "en-US". */
  locale: string;
  /** Resolved 12/24-hour clock. */
  timeFormat: DisplayTimeFormat;
  /** Injected current time (UTC epoch ms). */
  nowMs: number;
}

export const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Resolve the display timezone (§14). Never silently falls back to the browser timezone. */
export function resolveDisplayTimezone(
  setting: TimezoneSetting,
  hassTimezone: string | undefined
): string {
  if (setting && setting !== "home_assistant") return setting;
  return hassTimezone && hassTimezone !== "" ? hassTimezone : "UTC";
}

/** Resolve the clock format (§11: `auto` follows Home Assistant user preferences). */
export function resolveTimeFormat(
  setting: TimeFormatSetting,
  hassTimeFormat: string | undefined
): DisplayTimeFormat {
  if (setting === "12") return "12";
  if (setting === "24") return "24";
  return hassTimeFormat === "12" ? "12" : "24";
}

/** `YYYY-MM-DD` key of a DateTime in its own zone. */
export function dateToKey(dt: DateTime): string {
  return dt.toFormat("yyyy-MM-dd");
}

/** Local midnight DateTime for a `YYYY-MM-DD` key in the given zone. */
export function keyToDate(key: string, zone: string): DateTime {
  return DateTime.fromISO(key, { zone }).startOf("day");
}

/** `YYYY-MM-DD` key of a UTC epoch instant as seen in the display zone. */
export function keyFromMillis(ms: number, zone: string): string {
  return dateToKey(DateTime.fromMillis(ms, { zone }));
}

export function todayKey(nowMs: number, zone: string): string {
  return keyFromMillis(nowMs, zone);
}

/** Start of the week containing `dt` (calendar aware, in `dt`'s zone). */
export function startOfWeek(dt: DateTime, firstDay: FirstDay): DateTime {
  const day = dt.startOf("day");
  const offset = firstDay === "sunday" ? day.weekday % 7 : day.weekday - 1;
  return day.minus({ days: offset });
}

export function startOfWeekForDayKey(key: string, firstDay: FirstDay, zone: string): DateTime {
  return startOfWeek(keyToDate(key, zone), firstDay);
}

/** Calendar-day addition (DST safe). */
export function addCalendarDays(dt: DateTime, n: number): DateTime {
  return dt.plus({ days: n });
}

/**
 * ISO-8601 week number of a week row (§7). The ISO week number is determined
 * from the Thursday within the row, which is correct for both Monday-first and
 * Sunday-first rows.
 */
export function weekNumberForWeekStart(
  weekStart: DateTime,
  firstDay: FirstDay
): { weekNumber: number; weekYear: number } {
  const thursday = addCalendarDays(weekStart, firstDay === "sunday" ? 4 : 3);
  return { weekNumber: thursday.weekNumber, weekYear: thursday.weekYear };
}

/** Build `weeks` rows of seven DateTime days starting at `anchorWeekStart`. */
export function buildWeeks(anchorWeekStart: DateTime, weeks: number): DateTime[][] {
  const rows: DateTime[][] = [];
  for (let w = 0; w < weeks; w += 1) {
    const rowStart = addCalendarDays(anchorWeekStart, w * 7);
    const row: DateTime[] = [];
    for (let d = 0; d < 7; d += 1) {
      row.push(addCalendarDays(rowStart, d));
    }
    rows.push(row);
  }
  return rows;
}

/** Integer number of calendar days from `fromKey` to `toKey` (positive = later). */
export function dayKeyDiff(toKey: string, fromKey: string): number {
  const to = Date.UTC(...(isoParts(toKey) as [number, number, number]));
  const from = Date.UTC(...(isoParts(fromKey) as [number, number, number]));
  return Math.round((to - from) / 86400000);
}

function isoParts(key: string): [number, number, number] {
  const [y, m, d] = key.split("-").map((p) => parseInt(p, 10));
  return [y!, m!, d!];
}

/** Whether two UTC instants fall on the same local date in the display zone. */
export function sameLocalDay(aMs: number, bMs: number, zone: string): boolean {
  return keyFromMillis(aMs, zone) === keyFromMillis(bMs, zone);
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function dtFrom(ms: number, ctx: FormatContext): DateTime {
  return DateTime.fromMillis(ms, { zone: ctx.zone }).setLocale(ctx.locale);
}

function timeOptions(timeFormat: DisplayTimeFormat): Intl.DateTimeFormatOptions {
  return { hour: "numeric", minute: "2-digit", hour12: timeFormat === "12" };
}

/** Localized time, e.g. "18:30" or "6:30 PM". */
export function formatTime(ms: number, ctx: FormatContext): string {
  return dtFrom(ms, ctx).toLocaleString(timeOptions(ctx.timeFormat));
}

/**
 * Localized date. The year is included when it differs from the current year
 * (`includeYear: "auto"`, §11) or forced on/off explicitly.
 */
export function formatDate(
  dayKeyOrMs: string | number,
  ctx: FormatContext,
  includeYear: boolean | "auto" = "auto"
): string {
  const dt =
    typeof dayKeyOrMs === "string"
      ? keyToDate(dayKeyOrMs, ctx.zone).setLocale(ctx.locale)
      : dtFrom(dayKeyOrMs, ctx);
  const yearDiffers = dt.year !== DateTime.fromMillis(ctx.nowMs, { zone: ctx.zone }).year;
  const withYear = includeYear === "auto" ? yearDiffers : includeYear;
  const options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  if (withYear) options.year = "numeric";
  return dt.toLocaleString(options);
}

/** Long localized date, always with year — used in dialogs. */
export function formatLongDate(dayKeyOrMs: string | number, ctx: FormatContext): string {
  const dt =
    typeof dayKeyOrMs === "string"
      ? keyToDate(dayKeyOrMs, ctx.zone).setLocale(ctx.locale)
      : dtFrom(dayKeyOrMs, ctx);
  return dt.toLocaleString({ year: "numeric", month: "long", day: "numeric" });
}

/** Long localized weekday name of a date key, e.g. "Monday". */
export function formatWeekdayLong(dayKey: string, ctx: FormatContext): string {
  return keyToDate(dayKey, ctx.zone).setLocale(ctx.locale).toLocaleString({ weekday: "long" });
}

/**
 * Relative day label (§11): "Today", "Tomorrow", weekday two to six days ahead,
 * otherwise a localized date.
 */
export function formatDayLabel(dayKey: string, ctx: FormatContext): string {
  const diff = dayKeyDiff(dayKey, todayKey(ctx.nowMs, ctx.zone));
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff >= 2 && diff <= 6) return formatWeekdayLong(dayKey, ctx);
  return formatDate(dayKey, ctx);
}

/**
 * Relative label for an event row (§11), e.g. "Today · 18:30", "Tomorrow · All day",
 * "Monday · 18:30", "Oct 26 · 09:00".
 */
export function formatRelativeRowLabel(
  dayKey: string,
  timeLabel: string,
  ctx: FormatContext
): string {
  return `${formatDayLabel(dayKey, ctx)} · ${timeLabel}`;
}

/** Week label used by week selection buttons, e.g. "Oct 19 – 25" or "Oct 19 – 25, 2026". */
export function weekLabel(weekStart: DateTime, ctx: FormatContext, includeYear: boolean = false): string {
  const start = weekStart.setLocale(ctx.locale);
  const end = addCalendarDays(weekStart, 6).setLocale(ctx.locale);
  const sameMonth = start.month === end.month && start.year === end.year;
  const sameYear = start.year === end.year;
  const startOptions: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  if (!sameYear) startOptions.year = "numeric";
  // Intl cannot format day+year without a month; include the month whenever
  // the year is shown.
  const endOptions: Intl.DateTimeFormatOptions = { day: "numeric" };
  if (!sameMonth || includeYear || !sameYear) endOptions.month = "short";
  if (includeYear || !sameYear) endOptions.year = "numeric";
  return `${start.toLocaleString(startOptions)} – ${end.toLocaleString(endOptions)}`;
}

/** Header label for a displayed range spanning whole weeks. */
export function rangeHeaderLabel(
  firstDay: DateTime,
  lastDay: DateTime,
  ctx: FormatContext
): string {
  const start = firstDay.setLocale(ctx.locale);
  const end = lastDay.setLocale(ctx.locale);
  if (start.month === end.month && start.year === end.year) {
    return start.toLocaleString({ month: "long", year: "numeric" });
  }
  const includeYear = start.year !== end.year;
  const startStr = start.toLocaleString({
    month: "short",
    day: "numeric",
    year: includeYear ? "numeric" : undefined,
  });
  const endStr = end.toLocaleString({ month: "short", day: "numeric", year: "numeric" });
  return `${startStr} – ${endStr}`;
}

/**
 * Full absolute range for the event dialog (§11). All-day ranges are shown as
 * inclusive human dates ("October 19 – 21") because the API end date is
 * exclusive.
 */
export function formatFullRange(
  event:
    | { allDay: true; startDate: string; endDateExclusive: string }
    | { allDay: false; startMs: number; endMs: number },
  ctx: FormatContext
): string {
  if (event.allDay) {
    const endExclusive = keyToDate(event.endDateExclusive, ctx.zone);
    const endInclusive = endExclusive.minus({ days: 1 });
    const sameDay = event.startDate === dateToKey(endInclusive);
    const dateStr = sameDay
      ? formatLongDate(event.startDate, ctx)
      : `${formatLongDate(event.startDate, ctx)} – ${formatLongDate(dateToKey(endInclusive), ctx)}`;
    return `All day · ${dateStr}`;
  }
  const startDate = formatLongDate(event.startMs, ctx);
  const endDate = formatLongDate(event.endMs, ctx);
  const startTime = formatTime(event.startMs, ctx);
  const endTime = formatTime(event.endMs, ctx);
  if (sameLocalDay(event.startMs, event.endMs, ctx.zone)) {
    return `${startDate}, ${startTime} – ${endTime}`;
  }
  return `${startDate}, ${startTime} – ${endDate}, ${endTime}`;
}

/** "Last retrieved" label (§15 — never "Last ICS sync"). */
export function formatLastRetrieved(lastRetrievedAt: number, ctx: FormatContext): string {
  return `Last retrieved ${formatTime(lastRetrievedAt, ctx)}`;
}

/** Horizon label for the upcoming empty state (§9). */
export function formatHorizonLabel(horizonEndMs: number, ctx: FormatContext): string {
  return formatDate(horizonEndMs, ctx, true);
}
