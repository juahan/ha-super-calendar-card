/**
 * Fixture events in the exact Home Assistant calendar API shape
 * (see src/types.ts ApiEvent). Times are generated relative to "now" in
 * Europe/Helsinki so the preview always shows live-looking dates.
 *
 * The production card never uses these fixtures — they exist only for the
 * local preview and automated tests.
 */

const HELSINKI = "Europe/Helsinki";

function offsetMinutes(date, timeZone) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(dtf.formatToParts(date).map((p) => [p.type, p.value]));
  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second)
  );
  return Math.round((asUTC - date.getTime()) / 60000);
}

function helsinkiInstant(dayOffset, hours, minutes = 0) {
  // Wall time in Helsinki, dayOffset calendar days from today (DST safe).
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: HELSINKI,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [y, m, d] = fmt.format(now).split("-").map(Number);
  const wallAsUTC = Date.UTC(y, m - 1, d + dayOffset, hours, minutes);
  const guess = new Date(wallAsUTC);
  return new Date(wallAsUTC - offsetMinutes(guess, HELSINKI) * 60000).toISOString();
}

function at(dayOffset, hours, minutes = 0) {
  return helsinkiInstant(dayOffset, hours, minutes);
}

function dateKey(dayOffset) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: HELSINKI,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [y, m, d] = fmt.format(new Date()).split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d + dayOffset));
  return base.toISOString().slice(0, 10);
}

/** ISO instant of local midnight in Helsinki for a `YYYY-MM-DD` key. */
function helsinkiMidnight(key) {
  const [y, m, d] = key.split("-").map(Number);
  const wallAsUTC = Date.UTC(y, m - 1, d, 0, 0);
  return new Date(wallAsUTC - offsetMinutes(new Date(wallAsUTC), HELSINKI) * 60000).toISOString();
}

function timed(summary, startIso, endIso, extra = {}) {
  return {
    summary,
    start: { dateTime: startIso },
    end: { dateTime: endIso },
    uid: extra.uid ?? `uid-${summary}-${startIso}`,
    recurrence_id: extra.recurrence_id ?? null,
    location: extra.location ?? null,
    description: extra.description ?? null,
    rrule: null,
  };
}

function allDay(summary, startOffset, endOffsetExclusive, extra = {}) {
  return {
    summary,
    start: { date: dateKey(startOffset) },
    end: { date: dateKey(endOffsetExclusive) },
    uid: extra.uid ?? `uid-${summary}-${dateKey(startOffset)}`,
    recurrence_id: extra.recurrence_id ?? null,
    location: extra.location ?? null,
    description: extra.description ?? null,
    rrule: null,
  };
}

export function buildFixtures() {
  const now = new Date();
  const ongoingStart = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
  const ongoingEnd = new Date(now.getTime() + 30 * 60 * 1000).toISOString();

  return {
    "calendar.family": [
      allDay("School holiday", 0, 1),
      allDay("Grandma visits", 1, 4, {
        description: "Staying for the weekend. Brings cinnamon buns.",
      }),
      timed("Family dinner", at(0, 18, 30), at(0, 20, 0), { location: "Home" }),
      timed("Dentist appointment", at(1, 9, 0), at(1, 9, 45), {
        location: "Main street 5",
        description: "Bring the insurance card.\nAsk about the invoice from last time.",
      }),
      timed("Movie night", at(2, 19, 0), at(2, 21, 15), { location: "Kinopalatsi" }),
      allDay("Trip to Tallinn", 9, 12, {
        description: "Ferry from the west terminal at 08:00.",
      }),
      timed("Pick up the kids", at(7, 15, 30), at(7, 16, 0)),
      timed("Neighborhood meeting", at(14, 17, 0), at(14, 18, 30), { location: "Clubhouse" }),
    ],
    "calendar.work": [
      timed("Ongoing project sync", ongoingStart, ongoingEnd, {
        description: "Weekly status. Keep it short.",
      }),
      timed("Standup", at(0, 9, 15), at(0, 9, 30)),
      timed("Design review", at(0, 11, 0), at(0, 12, 0), {
        location: "Meeting room 2",
        description: "Bring the updated mockups.",
      }),
      timed("Lunch with Sam", at(0, 12, 30), at(0, 13, 15), { location: "Cafe Esplanad" }),
      timed("Late deploy window", at(0, 23, 0), at(1, 1, 0), {
        description: "Overnight change window; ends after midnight.",
      }),
      timed("Deadline: quarterly report", at(1, 16, 0), at(1, 17, 0)),
      timed("1:1 with manager", at(3, 10, 0), at(3, 10, 30)),
      timed("Release cut", at(2, 13, 0), at(2, 15, 0)),
      // Already-expanded recurring occurrences (UID shared, recurrence_id set).
      timed("Recurring: sprint review", at(5, 14, 0), at(5, 15, 0), {
        uid: "sprint-review",
        recurrence_id: "2026-10-24",
      }),
      timed("Recurring: sprint review", at(12, 14, 0), at(12, 15, 0), {
        uid: "sprint-review",
        recurrence_id: "2026-10-31",
      }),
      timed("Recurring: sprint review", at(19, 14, 0), at(19, 15, 0), {
        uid: "sprint-review",
        recurrence_id: "2026-11-07",
      }),
      timed("Far future planning", at(120, 10, 0), at(120, 11, 0), {
        description: "Beyond the default 90-day upcoming horizon.",
      }),
    ],
    "calendar.sports": [
      timed("Basketball practice", at(1, 17, 0), at(1, 18, 30), { location: "Sports hall" }),
      timed("Game day", at(6, 18, 0), at(6, 20, 0), { location: "Arena" }),
      timed("Yoga", at(4, 7, 30), at(4, 8, 15), { location: "Studio B" }),
      allDay("Tournament weekend", 2, 4),
      // Event without a summary → "Untitled event." fallback.
      timed(null, at(2, 8, 0), at(2, 9, 0)),
    ],
  };
}

export { HELSINKI, at, dateKey, timed, allDay, helsinkiMidnight };
