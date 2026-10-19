import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import {
  dedupeWithinSource,
  displayTitle,
  effectiveStartMs,
  eventsForDay,
  isCompleted,
  isOngoing,
  normalizeApiEvents,
  occursOnDay,
  overlapsRange,
  selectUpcoming,
  selectWeekEvents,
  sortForCalendar,
  sortForUpcoming,
  sourceOrderFrom,
  horizonEndMs,
  type SourceOrder,
} from "../src/events";
import { allDay, timed } from "./helpers";
import type { CalendarEvent, SourceConfig } from "../src/types";

const HELSINKI = "Europe/Helsinki";
const FAMILY: SourceConfig = { id: "family", entity: "calendar.family", name: "Family", color: null, icon: null };
const WORK: SourceConfig = { id: "work", entity: "calendar.work", name: "Work", color: null, icon: null };
const ORDER: SourceOrder = sourceOrderFrom([FAMILY, WORK]);

function ms(iso: string): number {
  return DateTime.fromISO(iso, { zone: HELSINKI }).toMillis();
}

function now(iso: string): number {
  return ms(iso);
}

describe("normalization (§13)", () => {
  it("preserves date-only events as dates with an exclusive end", () => {
    const { events, warnings } = normalizeApiEvents(
      [allDay("Holiday", "2026-10-19", "2026-10-20")],
      FAMILY,
      HELSINKI
    );
    expect(warnings).toEqual([]);
    expect(events).toHaveLength(1);
    const event = events[0]!;
    expect(event.allDay).toBe(true);
    if (event.allDay) {
      expect(event.startDate).toBe("2026-10-19");
      expect(event.endDateExclusive).toBe("2026-10-20");
    }
  });

  it("converts timed events to UTC epoch milliseconds", () => {
    const { events } = normalizeApiEvents(
      [timed("Standup", "2026-10-19T18:30:00+03:00", "2026-10-19T19:00:00+03:00")],
      WORK,
      HELSINKI
    );
    const event = events[0]!;
    expect(event.allDay).toBe(false);
    if (!event.allDay) {
      expect(event.startMs).toBe(ms("2026-10-19T18:30:00"));
      expect(event.endMs).toBe(ms("2026-10-19T19:00:00"));
    }
  });

  it("keeps zero-duration all-day events on their start day", () => {
    const { events } = normalizeApiEvents([allDay("Zero", "2026-10-19", "2026-10-19")], FAMILY, HELSINKI);
    const event = events[0]!;
    expect(event.allDay && event.endDateExclusive).toBe("2026-10-20");
    expect(occursOnDay(event, "2026-10-19", HELSINKI)).toBe(true);
    expect(occursOnDay(event, "2026-10-20", HELSINKI)).toBe(false);
  });

  it("represents zero-duration timed events by their start time", () => {
    const { events } = normalizeApiEvents(
      [timed("Alarm", "2026-10-19T00:00:00+03:00", "2026-10-19T00:00:00+03:00")],
      WORK,
      HELSINKI
    );
    const event = events[0]!;
    expect(occursOnDay(event, "2026-10-19", HELSINKI)).toBe(true);
    expect(isOngoing(event, ms("2026-10-19T00:00:00"), HELSINKI)).toBe(false);
    expect(isCompleted(event, ms("2026-10-19T00:00:01"), HELSINKI)).toBe(true);
  });

  it("skips malformed events with a warning and never throws", () => {
    const raw = [
      { summary: "No end", start: { dateTime: "2026-10-19T10:00:00" } },
      { summary: "Mixed", start: { date: "2026-10-19" }, end: { dateTime: "2026-10-19T10:00:00" } },
      { summary: "Bad date", start: { date: "2026-13-40" }, end: { date: "2026-13-41" } },
      {
        summary: "Reversed",
        start: { dateTime: "2026-10-19T10:00:00" },
        end: { dateTime: "2026-10-19T09:00:00" },
      },
      timed("Fine", "2026-10-19T10:00:00", "2026-10-19T11:00:00"),
    ];
    const { events, warnings } = normalizeApiEvents(raw, WORK, HELSINKI);
    expect(events).toHaveLength(1);
    expect(displayTitle(events[0]!)).toBe("Fine");
    expect(warnings).toHaveLength(4);
    for (const warning of warnings) expect(warning).toMatch(/skipped/);
  });

  it("falls back to 'Untitled event.' for missing titles", () => {
    const { events } = normalizeApiEvents(
      [{ start: { dateTime: "2026-10-19T10:00:00" }, end: { dateTime: "2026-10-19T11:00:00" } }],
      WORK,
      HELSINKI
    );
    expect(displayTitle(events[0]!)).toBe("Untitled event.");
  });

  it("builds stable identities from uid + occurrence, or deterministically", () => {
    const withUid = timed("A", "2026-10-19T10:00:00", "2026-10-19T11:00:00", { uid: "u1", recurrence_id: "r1" });
    const noUid: any = timed("B", "2026-10-19T12:00:00", "2026-10-19T13:00:00");
    delete noUid.uid;
    const first = normalizeApiEvents([withUid, noUid], WORK, HELSINKI).events;
    const second = normalizeApiEvents([withUid, noUid], WORK, HELSINKI).events;
    expect(first.map((e) => e.id)).toEqual(second.map((e) => e.id));
    expect(first[0]!.id).toContain("u1");
    expect(first[1]!.id).toContain("gen-");
  });

  it("dedupes overlapping request results within a source but not across sources", () => {
    const raw = [timed("Shared", "2026-10-19T10:00:00", "2026-10-19T11:00:00", { uid: "same" })];
    const familyEvents = normalizeApiEvents(raw, FAMILY, HELSINKI).events;
    const workEvents = normalizeApiEvents(raw, WORK, HELSINKI).events;
    const merged = dedupeWithinSource([...familyEvents, ...familyEvents, ...workEvents]);
    expect(merged).toHaveLength(2);
    expect(new Set(merged.map((e) => e.sourceId))).toEqual(new Set(["family", "work"]));
  });
});

describe("day occurrence and intervals (§13)", () => {
  const multi = normalizeApiEvents([allDay("Conference", "2026-10-19", "2026-10-22")], WORK, HELSINKI).events[0]!;
  const overnight = normalizeApiEvents(
    [timed("Night shift", "2026-10-19T22:00:00", "2026-10-20T02:00:00")],
    WORK,
    HELSINKI
  ).events[0]!;
  const endsMidnight = normalizeApiEvents(
    [timed("Late", "2026-10-19T20:00:00", "2026-10-20T00:00:00")],
    WORK,
    HELSINKI
  ).events[0]!;

  it("shows multi-day occurrences on every overlapping day", () => {
    for (const day of ["2026-10-19", "2026-10-20", "2026-10-21"]) {
      expect(occursOnDay(multi, day, HELSINKI)).toBe(true);
    }
    // End date is exclusive: not shown on Oct 22.
    expect(occursOnDay(multi, "2026-10-22", HELSINKI)).toBe(false);
    expect(occursOnDay(multi, "2026-10-18", HELSINKI)).toBe(false);
  });

  it("shows overnight timed events on both days", () => {
    expect(occursOnDay(overnight, "2026-10-19", HELSINKI)).toBe(true);
    expect(occursOnDay(overnight, "2026-10-20", HELSINKI)).toBe(true);
    expect(occursOnDay(overnight, "2026-10-21", HELSINKI)).toBe(false);
  });

  it("does not show an event ending at midnight on the following day", () => {
    expect(occursOnDay(endsMidnight, "2026-10-19", HELSINKI)).toBe(true);
    expect(occursOnDay(endsMidnight, "2026-10-20", HELSINKI)).toBe(false);
  });

  it("uses start-inclusive, end-exclusive ranges", () => {
    const range = { startMs: ms("2026-10-19T00:00:00"), endMs: ms("2026-10-20T00:00:00") };
    expect(overlapsRange(endsMidnight, range, HELSINKI)).toBe(true);
    // Its end instant equals the range end → does not overlap the next day.
    expect(overlapsRange(endsMidnight, { startMs: range.endMs, endMs: range.endMs + 86400000 }, HELSINKI)).toBe(false);
    expect(effectiveStartMs(multi, HELSINKI)).toBe(ms("2026-10-19T00:00:00"));
  });
});

describe("ongoing and completed (§9)", () => {
  const ongoingTimed = normalizeApiEvents(
    [timed("Now", "2026-10-19T10:00:00", "2026-10-19T11:00:00")],
    WORK,
    HELSINKI
  ).events[0]!;
  const ongoingDay = normalizeApiEvents([allDay("Trip", "2026-10-18", "2026-10-21")], FAMILY, HELSINKI).events[0]!;
  const todaysDay = normalizeApiEvents([allDay("Party", "2026-10-19", "2026-10-20")], FAMILY, HELSINKI).events[0]!;

  it("detects timed ongoing events as start <= now < end", () => {
    expect(isOngoing(ongoingTimed, ms("2026-10-19T10:00:00"), HELSINKI)).toBe(true);
    expect(isOngoing(ongoingTimed, ms("2026-10-19T10:59:59"), HELSINKI)).toBe(true);
    expect(isOngoing(ongoingTimed, ms("2026-10-19T11:00:00"), HELSINKI)).toBe(false);
    expect(isOngoing(ongoingTimed, ms("2026-10-19T09:59:59"), HELSINKI)).toBe(false);
  });

  it("detects all-day ongoing events by date range in the display timezone", () => {
    const t = ms("2026-10-19T15:00:00");
    expect(isOngoing(ongoingDay, t, HELSINKI)).toBe(true);
    expect(isOngoing(todaysDay, t, HELSINKI)).toBe(true);
    expect(isOngoing(ongoingDay, ms("2026-10-21T00:00:00"), HELSINKI)).toBe(false);
    // Display timezone decides "today": it is already Oct 20 in Tokyo.
    expect(isOngoing(todaysDay, ms("2026-10-19T23:30:00"), "Asia/Tokyo")).toBe(false);
    expect(isOngoing(todaysDay, ms("2026-10-19T23:30:00"), HELSINKI)).toBe(true);
  });

  it("marks completed events", () => {
    expect(isCompleted(ongoingTimed, ms("2026-10-19T11:00:00"), HELSINKI)).toBe(true);
    expect(isCompleted(ongoingTimed, ms("2026-10-19T10:59:00"), HELSINKI)).toBe(false);
  });
});

describe("sorting (§9, §13)", () => {
  const events: CalendarEvent[] = [
    ...normalizeApiEvents([allDay("Zulu all-day", "2026-10-20", "2026-10-21")], FAMILY, HELSINKI).events,
    ...normalizeApiEvents([timed("Bravo", "2026-10-20T08:00:00", "2026-10-20T09:00:00")], WORK, HELSINKI).events,
    ...normalizeApiEvents([allDay("Alpha all-day", "2026-10-20", "2026-10-21")], WORK, HELSINKI).events,
    ...normalizeApiEvents([timed("Charlie", "2026-10-20T08:00:00", "2026-10-20T09:00:00")], FAMILY, HELSINKI).events,
    ...normalizeApiEvents([timed("07:00", "2026-10-20T07:00:00", "2026-10-20T08:00:00")], WORK, HELSINKI).events,
  ];

  it("grid/agenda: all-day first, then start, source order, title, id", () => {
    const sorted = sortForCalendar(events, HELSINKI, ORDER);
    expect(sorted.map((e) => e.title)).toEqual([
      "Zulu all-day", // all-day first; source order breaks the midnight tie (family < work)
      "Alpha all-day",
      "07:00",
      "Charlie", // 08:00 tie → source order (family < work)
      "Bravo",
    ]);
  });

  it("upcoming: strictly by effective start (all-day at local midnight), then source, title", () => {
    const sorted = sortForUpcoming(events, HELSINKI, ORDER);
    expect(sorted.map((e) => e.title)).toEqual([
      "Zulu all-day", // local midnight Oct 20
      "Alpha all-day",
      "07:00",
      "Charlie",
      "Bravo",
    ]);
  });

  it("does not place every all-day event ahead of earlier timed events", () => {
    const mix = [
      ...normalizeApiEvents([timed("Early", "2026-10-20T06:00:00", "2026-10-20T07:00:00")], FAMILY, HELSINKI).events,
      ...normalizeApiEvents([allDay("Later day", "2026-10-21", "2026-10-22")], FAMILY, HELSINKI).events,
    ];
    const sorted = sortForUpcoming(mix, HELSINKI, ORDER);
    expect(sorted[0]!.title).toBe("Early");
    expect(sorted[1]!.title).toBe("Later day");
  });
});

describe("upcoming selection (§9)", () => {
  const nowMs = now("2026-10-19T14:00:00");
  const base = {
    nowMs,
    zone: HELSINKI,
    maxEvents: 10,
    lookaheadDays: 90,
    includeOngoing: true,
  };

  it("includes ongoing events and excludes completed events", () => {
    const events = [
      ...normalizeApiEvents([timed("Ongoing", "2026-10-19T13:00:00", "2026-10-19T15:00:00")], WORK, HELSINKI).events,
      ...normalizeApiEvents([timed("Done", "2026-10-19T10:00:00", "2026-10-19T11:00:00")], WORK, HELSINKI).events,
      ...normalizeApiEvents([timed("Future", "2026-10-19T18:00:00", "2026-10-19T19:00:00")], WORK, HELSINKI).events,
    ];
    const picked = selectUpcoming(events, ORDER, base);
    expect(picked.map((e) => e.title).sort()).toEqual(["Future", "Ongoing"]);
  });

  it("include_ongoing=false drops started timed events but keeps today's all-day events", () => {
    const events = [
      ...normalizeApiEvents([timed("Started", "2026-10-19T13:00:00", "2026-10-19T15:00:00")], WORK, HELSINKI).events,
      ...normalizeApiEvents([allDay("Today all-day", "2026-10-19", "2026-10-20")], WORK, HELSINKI).events,
      ...normalizeApiEvents([allDay("Multi ongoing", "2026-10-17", "2026-10-21")], WORK, HELSINKI).events,
      ...normalizeApiEvents([timed("Later", "2026-10-19T20:00:00", "2026-10-19T21:00:00")], WORK, HELSINKI).events,
    ];
    const picked = selectUpcoming(events, ORDER, { ...base, includeOngoing: false });
    expect(picked.map((e) => e.title).sort()).toEqual(["Later", "Today all-day"]);
  });

  it("limits to max_events and never extends beyond the horizon to fill the list", () => {
    const events = [
      ...normalizeApiEvents([timed("In horizon", "2026-10-19T18:00:00", "2026-10-19T19:00:00")], WORK, HELSINKI).events,
      // Horizon = 2027-01-17T14:00 (same local time, 90 calendar days ahead).
      ...normalizeApiEvents([timed("On horizon", "2027-01-17T13:00:00", "2027-01-17T13:30:00")], WORK, HELSINKI).events,
      ...normalizeApiEvents([timed("Beyond horizon", "2027-01-17T15:00:00", "2027-01-17T16:00:00")], WORK, HELSINKI).events,
    ];
    const picked = selectUpcoming(events, ORDER, { ...base, maxEvents: 5 });
    expect(picked.map((e) => e.title)).toEqual(["In horizon", "On horizon"]);
    const limited = selectUpcoming(events, ORDER, { ...base, maxEvents: 1 });
    expect(limited).toHaveLength(1);
    expect(limited[0]!.title).toBe("In horizon");
  });

  it("shows each multi-day occurrence once", () => {
    const events = normalizeApiEvents([allDay("Conference", "2026-10-19", "2026-10-23")], WORK, HELSINKI).events;
    const picked = selectUpcoming(events, ORDER, base);
    expect(picked).toHaveLength(1);
  });

  it("computes the horizon with calendar arithmetic (same local time)", () => {
    const end = horizonEndMs(nowMs, HELSINKI, 90);
    const expected = DateTime.fromMillis(nowMs, { zone: HELSINKI }).plus({ days: 90 }).toMillis();
    expect(end).toBe(expected);
  });
});

describe("selected-week list (§10)", () => {
  const week = { startMs: ms("2026-10-19T00:00:00"), endMs: ms("2026-10-26T00:00:00") };

  it("includes completed events in the selected week and reports totals", () => {
    const events = [
      ...normalizeApiEvents([timed("Earlier today", "2026-10-19T08:00:00", "2026-10-19T09:00:00")], WORK, HELSINKI).events,
      ...normalizeApiEvents([timed("Later in week", "2026-10-23T10:00:00", "2026-10-23T11:00:00")], WORK, HELSINKI).events,
      ...normalizeApiEvents([timed("Next week", "2026-10-26T10:00:00", "2026-10-26T11:00:00")], WORK, HELSINKI).events,
      ...normalizeApiEvents([allDay("Overlapping start", "2026-10-18", "2026-10-20")], FAMILY, HELSINKI).events,
    ];
    const result = selectWeekEvents(events, ORDER, { range: week, zone: HELSINKI, maxEvents: 10 });
    expect(result.total).toBe(3);
    expect(result.events.map((e) => e.title)).toEqual([
      "Overlapping start", // starts Oct 18 midnight? no: effective start Oct 18 → first
      "Earlier today",
      "Later in week",
    ]);
    const limited = selectWeekEvents(events, ORDER, { range: week, zone: HELSINKI, maxEvents: 2 });
    expect(limited.events).toHaveLength(2);
    expect(limited.total).toBe(3);
  });
});

describe("day helpers", () => {
  it("lists events for a day sorted for the calendar", () => {
    const events = [
      ...normalizeApiEvents([timed("B", "2026-10-19T10:00:00", "2026-10-19T11:00:00")], WORK, HELSINKI).events,
      ...normalizeApiEvents([allDay("A", "2026-10-19", "2026-10-20")], WORK, HELSINKI).events,
      ...normalizeApiEvents([timed("C", "2026-10-20T10:00:00", "2026-10-20T11:00:00")], WORK, HELSINKI).events,
    ];
    const day = eventsForDay(events, "2026-10-19", HELSINKI, ORDER);
    expect(day.map((e) => e.title)).toEqual(["A", "B"]);
  });
});
