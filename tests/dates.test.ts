import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import {
  addCalendarDays,
  buildWeeks,
  dateToKey,
  dayKeyDiff,
  formatDate,
  formatDayLabel,
  formatFullRange,
  formatHorizonLabel,
  formatLastRetrieved,
  formatRelativeRowLabel,
  formatTime,
  formatWeekdayLong,
  keyFromMillis,
  keyToDate,
  rangeHeaderLabel,
  resolveDisplayTimezone,
  resolveTimeFormat,
  sameLocalDay,
  startOfWeek,
  todayKey,
  weekLabel,
  weekNumberForWeekStart,
  type FormatContext,
} from "../src/dates";

const HELSINKI = "Europe/Helsinki";
const NEW_YORK = "America/New_York";

function ctx(overrides: Partial<FormatContext> = {}): FormatContext {
  return {
    zone: HELSINKI,
    locale: "en-US",
    timeFormat: "24",
    nowMs: DateTime.fromISO("2026-10-19T14:00:00", { zone: HELSINKI }).toMillis(),
    ...overrides,
  };
}

describe("timezone resolution (§14)", () => {
  it("home_assistant follows Home Assistant's timezone, never the browser's", () => {
    expect(resolveDisplayTimezone("home_assistant", HELSINKI)).toBe(HELSINKI);
    expect(resolveDisplayTimezone("home_assistant", NEW_YORK)).toBe(NEW_YORK);
  });

  it("falls back to UTC when hass has no timezone (not the browser timezone)", () => {
    expect(resolveDisplayTimezone("home_assistant", undefined)).toBe("UTC");
  });

  it("uses an explicit IANA timezone when configured", () => {
    expect(resolveDisplayTimezone("Asia/Tokyo", HELSINKI)).toBe("Asia/Tokyo");
    expect(resolveDisplayTimezone("UTC", HELSINKI)).toBe("UTC");
  });

  it("resolves the clock format from config and user preference", () => {
    expect(resolveTimeFormat("12", "24")).toBe("12");
    expect(resolveTimeFormat("24", "12")).toBe("24");
    expect(resolveTimeFormat("auto", "12")).toBe("12");
    expect(resolveTimeFormat("auto", "24")).toBe("24");
    expect(resolveTimeFormat("auto", "language")).toBe("24");
    expect(resolveTimeFormat("auto", undefined)).toBe("24");
  });
});

describe("week arithmetic (§7)", () => {
  it("computes Monday-first week starts", () => {
    expect(dateToKey(startOfWeek(keyToDate("2026-10-19", HELSINKI), "monday"))).toBe("2026-10-19");
    // Sunday belongs to the week that started the previous Monday.
    expect(dateToKey(startOfWeek(keyToDate("2026-10-25", HELSINKI), "monday"))).toBe("2026-10-19");
    expect(dateToKey(startOfWeek(keyToDate("2026-10-18", HELSINKI), "monday"))).toBe("2026-10-12");
  });

  it("computes Sunday-first week starts", () => {
    expect(dateToKey(startOfWeek(keyToDate("2026-10-18", HELSINKI), "sunday"))).toBe("2026-10-18");
    expect(dateToKey(startOfWeek(keyToDate("2026-10-24", HELSINKI), "sunday"))).toBe("2026-10-18");
    expect(dateToKey(startOfWeek(keyToDate("2026-10-25", HELSINKI), "sunday"))).toBe("2026-10-25");
  });

  it("uses ISO week numbers from the Thursday within the row", () => {
    // Monday-first rows.
    expect(weekNumberForWeekStart(keyToDate("2026-10-19", HELSINKI), "monday")).toEqual({
      weekNumber: 43,
      weekYear: 2026,
    });
    // Sunday-first row Sun 2026-10-18 .. Sat 2026-10-24 → Thursday Oct 22 → week 43.
    expect(weekNumberForWeekStart(keyToDate("2026-10-18", HELSINKI), "sunday")).toEqual({
      weekNumber: 43,
      weekYear: 2026,
    });
  });

  it("keeps ISO week-year at year boundaries", () => {
    // Mon 2025-12-29 .. Sun 2026-01-04 → Thursday Jan 1 → week 1 of 2026.
    expect(weekNumberForWeekStart(keyToDate("2025-12-29", HELSINKI), "monday")).toEqual({
      weekNumber: 1,
      weekYear: 2026,
    });
    // Sun 2026-12-27 .. Sat 2027-01-02 → Thursday Dec 31 → week 53 of 2026.
    expect(weekNumberForWeekStart(keyToDate("2026-12-27", HELSINKI), "sunday")).toEqual({
      weekNumber: 53,
      weekYear: 2026,
    });
    // Mon 2020-12-28 is ISO week 53 of 2020 (classic boundary case).
    expect(weekNumberForWeekStart(keyToDate("2020-12-28", HELSINKI), "monday")).toEqual({
      weekNumber: 53,
      weekYear: 2020,
    });
  });

  it("builds consecutive seven-day weeks", () => {
    const rows = buildWeeks(keyToDate("2026-10-19", HELSINKI), 4);
    expect(rows).toHaveLength(4);
    for (const row of rows) expect(row).toHaveLength(7);
    expect(dateToKey(rows[0]![0]!)).toBe("2026-10-19");
    expect(dateToKey(rows[0]![6]!)).toBe("2026-10-25");
    expect(dateToKey(rows[1]![0]!)).toBe("2026-10-26");
    expect(dateToKey(rows[3]![6]!)).toBe("2026-11-15");
  });

  it("adds calendar days across the spring-forward transition (DST)", () => {
    // Europe/Helsinki springs forward on 2026-03-29 (23-hour day).
    const dayStart = keyToDate("2026-03-29", HELSINKI);
    const nextStart = addCalendarDays(dayStart, 1);
    expect(dateToKey(nextStart)).toBe("2026-03-30");
    expect(nextStart.toMillis() - dayStart.toMillis()).toBe(23 * 3600 * 1000);
    // Calendar arithmetic keeps midnight boundaries aligned.
    expect(dateToKey(addCalendarDays(keyToDate("2026-03-28", HELSINKI), 2))).toBe("2026-03-30");
  });

  it("adds calendar days across the fall-back transition (DST)", () => {
    // Europe/Helsinki falls back on 2026-10-25 (25-hour day).
    const dayStart = keyToDate("2026-10-25", HELSINKI);
    const nextStart = addCalendarDays(dayStart, 1);
    expect(dateToKey(nextStart)).toBe("2026-10-26");
    expect(nextStart.toMillis() - dayStart.toMillis()).toBe(25 * 3600 * 1000);
  });
});

describe("day keys and local days (§14)", () => {
  it("produces display-timezone day keys regardless of browser timezone", () => {
    // 2026-10-19 23:30 in Helsinki is still Oct 19 there but Oct 19 22:30 UTC...
    const ms = DateTime.fromISO("2026-10-19T23:30:00", { zone: HELSINKI }).toMillis();
    expect(keyFromMillis(ms, HELSINKI)).toBe("2026-10-19");
    expect(keyFromMillis(ms, "UTC")).toBe("2026-10-19");
    // ...and 00:30 Helsinki on Oct 20 is still Oct 19 in New York.
    const late = DateTime.fromISO("2026-10-20T00:30:00", { zone: HELSINKI }).toMillis();
    expect(keyFromMillis(late, HELSINKI)).toBe("2026-10-20");
    expect(keyFromMillis(late, NEW_YORK)).toBe("2026-10-19");
    expect(todayKey(late, HELSINKI)).toBe("2026-10-20");
  });

  it("handles sameLocalDay across a DST boundary", () => {
    const a = DateTime.fromISO("2026-03-29T01:00:00", { zone: HELSINKI }).toMillis();
    const b = DateTime.fromISO("2026-03-29T23:30:00", { zone: HELSINKI }).toMillis();
    expect(sameLocalDay(a, b, HELSINKI)).toBe(true);
    expect(sameLocalDay(a, b + 3600_000, HELSINKI)).toBe(false);
  });

  it("computes integer day-key differences", () => {
    expect(dayKeyDiff("2026-03-30", "2026-03-28")).toBe(2);
    expect(dayKeyDiff("2026-10-25", "2026-10-26")).toBe(-1);
    expect(dayKeyDiff("2027-01-01", "2026-12-31")).toBe(1);
  });
});

describe("formatting (§11)", () => {
  it("formats times in 12 and 24 hour clocks", () => {
    const ms = DateTime.fromISO("2026-10-19T18:30:00", { zone: HELSINKI }).toMillis();
    expect(formatTime(ms, ctx())).toBe("18:30");
    expect(formatTime(ms, ctx({ timeFormat: "12" }))).toBe("6:30 PM");
  });

  it("uses the relative day label table", () => {
    const c = ctx(); // now = 2026-10-19
    expect(formatDayLabel("2026-10-19", c)).toBe("Today");
    expect(formatDayLabel("2026-10-20", c)).toBe("Tomorrow");
    expect(formatDayLabel("2026-10-21", c)).toBe("Wednesday");
    expect(formatDayLabel("2026-10-24", c)).toBe("Saturday"); // 2..6 days → weekday
    expect(formatDayLabel("2026-10-25", c)).toBe("Sunday"); // 6 days ahead is still a weekday
    expect(formatDayLabel("2026-10-26", c)).toBe("Oct 26"); // 7+ days → localized date
    expect(formatDayLabel("2026-10-18", c)).toBe("Oct 18");
  });

  it("builds relative row labels with All day substitution", () => {
    const c = ctx();
    expect(formatRelativeRowLabel("2026-10-19", "18:30", c)).toBe("Today · 18:30");
    expect(formatRelativeRowLabel("2026-10-20", "09:00", c)).toBe("Tomorrow · 09:00");
    expect(formatRelativeRowLabel("2026-10-19", "All day", c)).toBe("Today · All day");
    expect(formatRelativeRowLabel("2026-10-22", "All day", c)).toBe("Thursday · All day");
    expect(formatRelativeRowLabel("2026-11-22", "All day", c)).toBe("Nov 22 · All day");
  });

  it("omits the year in absolute dates when it matches the current year", () => {
    const c = ctx();
    expect(formatDate("2026-10-19", c, "auto")).toBe("Oct 19");
    expect(formatDate("2025-10-19", c, "auto")).toBe("Oct 19, 2025");
    expect(formatDate("2026-10-19", c, true)).toBe("Oct 19, 2026");
  });

  it("renders full ranges: single-day all-day, multi-day all-day, timed, overnight", () => {
    const c = ctx();
    expect(formatFullRange({ allDay: true, startDate: "2026-10-19", endDateExclusive: "2026-10-20" }, c)).toBe(
      "All day · October 19, 2026"
    );
    // Exclusive end date displays as an inclusive human range.
    expect(formatFullRange({ allDay: true, startDate: "2026-10-19", endDateExclusive: "2026-10-22" }, c)).toBe(
      "All day · October 19, 2026 – October 21, 2026"
    );
    const start = DateTime.fromISO("2026-10-19T18:30:00", { zone: HELSINKI }).toMillis();
    const end = DateTime.fromISO("2026-10-19T20:00:00", { zone: HELSINKI }).toMillis();
    expect(formatFullRange({ allDay: false, startMs: start, endMs: end }, c)).toBe(
      "October 19, 2026, 18:30 – 20:00"
    );
    const nightEnd = DateTime.fromISO("2026-10-20T01:00:00", { zone: HELSINKI }).toMillis();
    expect(formatFullRange({ allDay: false, startMs: start, endMs: nightEnd }, c)).toBe(
      "October 19, 2026, 18:30 – October 20, 2026, 01:00"
    );
  });

  it("labels the last retrieval without any ICS wording (§15)", () => {
    const label = formatLastRetrieved(DateTime.fromISO("2026-10-19T12:00", { zone: HELSINKI }).toMillis(), ctx());
    expect(label).toContain("Last retrieved");
    expect(label).not.toMatch(/ics|sync|feed/i);
  });

  it("formats horizon and weekday labels", () => {
    expect(formatHorizonLabel(DateTime.fromISO("2027-01-17T14:00", { zone: HELSINKI }).toMillis(), ctx())).toBe(
      "Jan 17, 2027"
    );
    expect(formatWeekdayLong("2026-10-19", ctx())).toBe("Monday");
  });

  it("builds week and range labels", () => {
    const c = ctx();
    expect(weekLabel(keyToDate("2026-10-19", HELSINKI), c)).toBe("Oct 19 – 25");
    expect(weekLabel(keyToDate("2026-10-19", HELSINKI), c, true)).toBe("Oct 19 – Oct 25, 2026");
    expect(weekLabel(keyToDate("2026-10-26", HELSINKI), c)).toBe("Oct 26 – Nov 1");
    expect(weekLabel(keyToDate("2026-10-26", HELSINKI), c, true)).toBe("Oct 26 – Nov 1, 2026");
    expect(weekLabel(keyToDate("2026-12-28", HELSINKI), c, true)).toBe("Dec 28, 2026 – Jan 3, 2027");
    expect(rangeHeaderLabel(keyToDate("2026-10-19", HELSINKI), keyToDate("2026-11-15", HELSINKI), c)).toBe(
      "Oct 19 – Nov 15, 2026"
    );
    expect(rangeHeaderLabel(keyToDate("2026-10-01", HELSINKI), keyToDate("2026-10-28", HELSINKI), c)).toBe(
      "October 2026"
    );
    expect(rangeHeaderLabel(keyToDate("2026-12-28", HELSINKI), keyToDate("2027-01-17", HELSINKI), c)).toBe(
      "Dec 28, 2026 – Jan 17, 2027"
    );
  });
});
