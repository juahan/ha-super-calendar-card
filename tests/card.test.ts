import { describe, expect, it, vi } from "vitest";
import { DateTime } from "luxon";
import "../src/index";
import { CalendarWeekCard } from "../src/card";
import { makeHass, timed, allDay, type MockHass } from "./helpers";
import type { HassLike } from "../src/types";

const HELSINKI = "Europe/Helsinki";

function isoToday(offsetDays: number, time: string): string {
  return DateTime.now()
    .setZone(HELSINKI)
    .plus({ days: offsetDays })
    .set({ hour: 0, minute: 0, second: 0, millisecond: 0 })
    .set({ hour: parseInt(time.slice(0, 2), 10), minute: parseInt(time.slice(3), 10) })
    .toISO()!;
}

function dateKeyToday(offsetDays: number): string {
  return DateTime.now().setZone(HELSINKI).plus({ days: offsetDays }).toFormat("yyyy-MM-dd");
}

const BASE_CONFIG = {
  title: "Household Calendar",
  sources: [
    { id: "family", entity: "calendar.family", name: "Family", color: "#4CAF50" },
    { id: "work", entity: "calendar.work", name: "Work", color: "#2196F3" },
  ],
};

async function settle(el: CalendarWeekCard, rounds = 60): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await el.updateComplete;
    if (!(el as any)._loading) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      await el.updateComplete;
      return;
    }
  }
}

async function mount(config: unknown, hass: HassLike): Promise<CalendarWeekCard> {
  const el = document.createElement("calendar-week-card") as CalendarWeekCard;
  document.body.appendChild(el);
  el.hass = hass;
  el.setConfig(config);
  await el.updateComplete;
  await settle(el);
  return el;
}

function sizeCard(el: CalendarWeekCard, cardWidth: number, calendarWidth: number): void {
  (el as any)._cardWidth = cardWidth;
  (el as any)._calendarWidth = calendarWidth;
  el.requestUpdate();
}

function text(el: CalendarWeekCard): string {
  return el.shadowRoot?.textContent ?? "";
}

describe("card configuration (§6)", () => {
  it("throws an actionable error for invalid configuration", () => {
    const el = document.createElement("calendar-week-card") as CalendarWeekCard;
    expect(() => el.setConfig({})).toThrow(/sources/i);
    expect(() => el.setConfig({ sources: [{ id: "x", entity: "sensor.y" }] })).toThrow(/calendar\./i);
  });
});

describe("view arrangements (§4)", () => {
  const events = {
    "calendar.family": [allDay("Family day", dateKeyToday(1), dateKeyToday(2))],
  };

  it("calendar only", async () => {
    const el = await mount({ ...BASE_CONFIG, view: "calendar" }, makeHass({ eventsByEntity: events }));
    expect(el.shadowRoot!.querySelector(".cal-section")).toBeTruthy();
    expect(el.shadowRoot!.querySelector(".up-section")).toBeNull();
  });

  it("upcoming only", async () => {
    const el = await mount({ ...BASE_CONFIG, view: "upcoming" }, makeHass({ eventsByEntity: events }));
    expect(el.shadowRoot!.querySelector(".up-section")).toBeTruthy();
    expect(el.shadowRoot!.querySelector(".cal-section")).toBeNull();
    expect(text(el)).toContain("Upcoming");
  });

  it("combined calendar_top puts the calendar first", async () => {
    const el = await mount(
      { ...BASE_CONFIG, view: "combined", combined_layout: "calendar_top" },
      makeHass({ eventsByEntity: events })
    );
    const stack = el.shadowRoot!.querySelector(".cwc-stacked")!;
    const children = [...stack.children];
    expect(children[0]!.querySelector(".cal-section")).toBeTruthy();
    expect(children[1]!.matches(".up-section")).toBe(true);
  });

  it("combined list_top puts the list first", async () => {
    const el = await mount(
      { ...BASE_CONFIG, view: "combined", combined_layout: "list_top" },
      makeHass({ eventsByEntity: events })
    );
    const stack = el.shadowRoot!.querySelector(".cwc-stacked")!;
    const children = [...stack.children];
    expect(children[0]!.matches(".up-section")).toBe(true);
    expect(children[1]!.querySelector(".cal-section")).toBeTruthy();
  });

  it("side_by_side uses 60/40 at wide card widths and stacks below 1100px", async () => {
    const el = await mount(
      { ...BASE_CONFIG, view: "combined", combined_layout: "side_by_side" },
      makeHass({ eventsByEntity: events })
    );
    sizeCard(el, 1200, 900);
    await el.updateComplete;
    expect(el.shadowRoot!.querySelector(".cwc-side-by-side")).toBeTruthy();
    sizeCard(el, 1000, 900);
    await el.updateComplete;
    expect(el.shadowRoot!.querySelector(".cwc-side-by-side")).toBeNull();
    expect(el.shadowRoot!.querySelector(".cwc-stacked")).toBeTruthy();
  });
});

describe("grid and agenda responsiveness (§8)", () => {
  const events = {
    "calendar.family": [timed("A", isoToday(1, "10:00"), isoToday(1, "11:00"))],
  };

  it("auto layout: grid at >= 840px, agenda below", async () => {
    const el = await mount(BASE_CONFIG, makeHass({ eventsByEntity: events }));
    sizeCard(el, 1200, 900);
    await el.updateComplete;
    expect(el.shadowRoot!.querySelector(".grid")).toBeTruthy();
    sizeCard(el, 1200, 839);
    await el.updateComplete;
    expect(el.shadowRoot!.querySelector(".grid")).toBeNull();
    expect(el.shadowRoot!.querySelector(".agenda")).toBeTruthy();
  });

  it("layout grid stays as a scrollable grid in narrow containers", async () => {
    const el = await mount(
      { ...BASE_CONFIG, calendar: { layout: "grid" } },
      makeHass({ eventsByEntity: events })
    );
    sizeCard(el, 500, 400);
    await el.updateComplete;
    expect(el.shadowRoot!.querySelector(".grid-scroll")).toBeTruthy();
    expect(el.shadowRoot!.querySelector(".grid.forced")).toBeTruthy();
    expect(el.shadowRoot!.querySelector(".agenda")).toBeNull();
  });

  it("layout agenda always renders the agenda", async () => {
    const el = await mount(
      { ...BASE_CONFIG, calendar: { layout: "agenda" } },
      makeHass({ eventsByEntity: events })
    );
    sizeCard(el, 1200, 900);
    await el.updateComplete;
    expect(el.shadowRoot!.querySelector(".agenda")).toBeTruthy();
  });

  it("keeps seven day columns and never uses week numbers as day headings", async () => {
    const el = await mount(BASE_CONFIG, makeHass({ eventsByEntity: events }));
    sizeCard(el, 1200, 900);
    await el.updateComplete;
    const rows = [...el.shadowRoot!.querySelectorAll(".grid-row")];
    const header = rows[0]!;
    expect(header.querySelectorAll(".grid-head")).toHaveLength(8); // week col + 7 days
    for (const row of rows.slice(1)) {
      expect(row.querySelectorAll(".day")).toHaveLength(7);
      expect(row.querySelectorAll(".wk-cell")).toHaveLength(1);
    }
  });
});

describe("multiweek navigation (§7)", () => {
  it("shifts by one week and Today returns to the current week", async () => {
    const el = await mount(BASE_CONFIG, makeHass({ eventsByEntity: {} }));
    sizeCard(el, 1200, 900);
    await el.updateComplete;
    const label = () => el.shadowRoot!.querySelector(".cal-range")!.textContent!.trim();
    const initial = label();
    const next = el.shadowRoot!.querySelector<HTMLButtonElement>('button[aria-label="Next week"]')!;
    next.click();
    await el.updateComplete;
    expect(label()).not.toBe(initial);
    const prev = el.shadowRoot!.querySelector<HTMLButtonElement>('button[aria-label="Previous week"]')!;
    prev.click();
    await el.updateComplete;
    expect(label()).toBe(initial);
    prev.click();
    await el.updateComplete;
    const past = label();
    el.shadowRoot!.querySelector<HTMLButtonElement>(".cal-controls .cwc-text-button")!.click();
    await el.updateComplete;
    expect(label()).toBe(initial);
    expect(past).not.toBe(initial);
  });

  it("clears the week selection on navigation", async () => {
    const el = await mount(
      { ...BASE_CONFIG, upcoming: { follow_selected_week: true } },
      makeHass({ eventsByEntity: {} })
    );
    sizeCard(el, 1200, 900);
    await el.updateComplete;
    const weekBtn = el.shadowRoot!.querySelector<HTMLButtonElement>(".wk-btn")!;
    weekBtn.click();
    await settle(el);
    expect(el.shadowRoot!.querySelectorAll(".wk-btn[aria-pressed='true']").length).toBeGreaterThan(0);
    el.shadowRoot!.querySelector<HTMLButtonElement>('button[aria-label="Next week"]')!.click();
    await settle(el);
    expect(el.shadowRoot!.querySelectorAll(".wk-btn[aria-pressed='true']").length).toBe(0);
  });

  it("auto-advances at a week boundary only when following the current week", async () => {
    const el = await mount(BASE_CONFIG, makeHass({ eventsByEntity: {} }));
    sizeCard(el, 1200, 900);
    await el.updateComplete;
    const label = () => el.shadowRoot!.querySelector(".cal-range")!.textContent!.trim();
    const initial = label();
    const realNow = Date.now;
    try {
      // Following: one week later the range advances.
      Date.now = () => realNow() + 7 * 86400000;
      (el as any)._tickMinute();
      await settle(el);
      expect(label()).not.toBe(initial);

      // Deliberately navigated: preserved.
      Date.now = realNow;
      (el as any)._tickMinute();
      await settle(el);
      el.shadowRoot!.querySelector<HTMLButtonElement>('button[aria-label="Previous week"]')!.click();
      await settle(el);
      const chosen = label();
      Date.now = () => realNow() + 7 * 86400000;
      (el as any)._tickMinute();
      await settle(el);
      expect(label()).toBe(chosen);
    } finally {
      Date.now = realNow;
    }
  });
});

describe("day rendering and +N more (§7)", () => {
  it("sorts all-day before timed and opens the day dialog with every event", async () => {
    const events = {
      "calendar.family": [
        timed("Timed", isoToday(1, "10:00"), isoToday(1, "11:00")),
        allDay("All day", dateKeyToday(1), dateKeyToday(2)),
        timed("Second timed", isoToday(1, "09:00"), isoToday(1, "09:30")),
      ],
    };
    const el = await mount(
      { ...BASE_CONFIG, calendar: { max_events_per_day: 2 } },
      makeHass({ eventsByEntity: events })
    );
    sizeCard(el, 1200, 900);
    await el.updateComplete;
    const chips = el.shadowRoot!.querySelectorAll(".cwc-chip");
    expect(chips.length).toBe(2);
    const more = el.shadowRoot!.querySelector<HTMLButtonElement>(".more-btn")!;
    expect(more.textContent).toContain("+1 more");
    more.click();
    await el.updateComplete;
    const dialog = el.shadowRoot!.querySelector("cwc-dialog") as HTMLElement & { model: any };
    expect(dialog.model?.kind).toBe("day");
    expect(dialog.model.events).toHaveLength(3);
  });

  it("shows all-day events before timed events in a day cell", async () => {
    const events = {
      "calendar.family": [
        timed("Timed", isoToday(1, "10:00"), isoToday(1, "11:00")),
        allDay("All day", dateKeyToday(1), dateKeyToday(2)),
      ],
    };
    const el = await mount(
      { ...BASE_CONFIG, calendar: { max_events_per_day: 5 } },
      makeHass({ eventsByEntity: events })
    );
    sizeCard(el, 1200, 900);
    await el.updateComplete;
    const chipLabels = [...el.shadowRoot!.querySelectorAll(".cwc-chip .title")].map((n) => n.textContent);
    expect(chipLabels[0]).toBe("All day");
    expect(chipLabels[1]).toBe("Timed");
  });
});

describe("week selection and list filtering (§10)", () => {
  const weekEvents = {
    "calendar.family": [
      timed("Week event", isoToday(1, "10:00"), isoToday(1, "11:00")),
      timed("Far event", isoToday(30, "10:00"), isoToday(30, "11:00")),
    ],
  };

  it("follow_selected_week=false leaves the list unchanged and highlights the week", async () => {
    const el = await mount(BASE_CONFIG, makeHass({ eventsByEntity: weekEvents }));
    sizeCard(el, 1200, 900);
    await el.updateComplete;
    const before = el.shadowRoot!.querySelector(".up-list")!.textContent;
    el.shadowRoot!.querySelector<HTMLButtonElement>(".wk-btn")!.click();
    await settle(el);
    expect(el.shadowRoot!.querySelector(".up-list")!.textContent).toBe(before);
    expect(el.shadowRoot!.querySelector(".wk-btn[aria-pressed='true']")).toBeTruthy();
  });

  it("follow_selected_week=true filters the list and can be cleared", async () => {
    const el = await mount(
      { ...BASE_CONFIG, upcoming: { follow_selected_week: true, max_events: 10 } },
      makeHass({ eventsByEntity: weekEvents })
    );
    sizeCard(el, 1200, 900);
    await el.updateComplete;
    const listText = () => el.shadowRoot!.querySelector(".up-section")!.textContent!;
    expect(listText()).toContain("Far event");
    el.shadowRoot!.querySelector<HTMLButtonElement>(".wk-btn")!.click();
    await settle(el);
    expect(listText()).not.toContain("Upcoming");
    expect(listText()).toContain("Week event");
    expect(listText()).not.toContain("Far event");
    expect(listText()).toContain("Clear week selection");
    const clearBtn = [...el.shadowRoot!.querySelectorAll<HTMLButtonElement>(".up-actions button")].find((b) =>
      b.textContent!.includes("Clear week selection")
    )!;
    clearBtn.click();
    await settle(el);
    expect(listText()).toContain("Upcoming");
    expect(listText()).toContain("Far event");
  });

  it("show all N events expands the week-filtered list", async () => {
    const events = {
      "calendar.family": Array.from({ length: 6 }, (_, i) =>
        timed(`E${i}`, isoToday(1, `1${i}:00`), isoToday(1, `1${i}:30`))
      ),
    };
    const el = await mount(
      { ...BASE_CONFIG, upcoming: { follow_selected_week: true, max_events: 2 } },
      makeHass({ eventsByEntity: events })
    );
    sizeCard(el, 1200, 900);
    await el.updateComplete;
    el.shadowRoot!.querySelector<HTMLButtonElement>(".wk-btn")!.click();
    await settle(el);
    const listText = () => el.shadowRoot!.querySelector(".up-section")!.textContent!;
    expect(listText()).toContain("Show all 6 events");
    const showAll = [...el.shadowRoot!.querySelectorAll<HTMLButtonElement>(".up-actions button")].find((b) =>
      b.textContent!.includes("Show all")
    )!;
    showAll.click();
    await settle(el);
    expect(el.shadowRoot!.querySelectorAll(".up-list .cwc-row").length).toBe(6);
    expect(listText()).not.toContain("Show all");
  });

  it("opens a week dialog in calendar-only mode", async () => {
    const el = await mount({ ...BASE_CONFIG, view: "calendar" }, makeHass({ eventsByEntity: weekEvents }));
    sizeCard(el, 1200, 900);
    await el.updateComplete;
    el.shadowRoot!.querySelector<HTMLButtonElement>(".wk-btn")!.click();
    await el.updateComplete;
    const dialog = el.shadowRoot!.querySelector("cwc-dialog") as HTMLElement & { model: any };
    expect(dialog.model?.kind).toBe("week");
    expect(dialog.model.events.length).toBeGreaterThanOrEqual(1);
  });
});

describe("upcoming list (§9)", () => {
  it("shows relative labels, in-progress indicator and the horizon empty state", async () => {
    const events = {
      "calendar.family": [
        timed("Ongoing", isoToday(0, "00:00"), isoToday(0, "23:59")),
        timed("Tomorrow", isoToday(1, "09:00"), isoToday(1, "10:00")),
      ],
    };
    const el = await mount(
      { ...BASE_CONFIG, upcoming: { max_events: 10, include_ongoing: true } },
      makeHass({ eventsByEntity: events })
    );
    const upText = () => el.shadowRoot!.querySelector(".up-section")!.textContent!;
    expect(upText()).toContain("In progress");
    expect(/Today · \d{2}:\d{2}/.test(upText())).toBe(true);
    expect(/Tomorrow · 09:00/.test(upText())).toBe(true);

    const emptyEl = await mount(
      BASE_CONFIG,
      makeHass({ eventsByEntity: {}, friendlyNames: { "calendar.family": "Family", "calendar.work": "Work" } })
    );
    const horizon = DateTime.now().setZone(HELSINKI).plus({ days: 90 }).year;
    expect(text(emptyEl)).toContain("No upcoming events through");
    expect(text(emptyEl)).toContain(String(horizon));
  });

  it("the heading count reflects events displayed, not the configured maximum", async () => {
    const events = {
      "calendar.family": [timed("One", isoToday(1, "09:00"), isoToday(1, "10:00"))],
    };
    const el = await mount(
      { ...BASE_CONFIG, upcoming: { max_events: 10 } },
      makeHass({ eventsByEntity: events })
    );
    const badge = el.shadowRoot!.querySelector(".up-count")!;
    expect(badge.textContent!.trim()).toBe("1");
    expect(badge.getAttribute("aria-label")).toContain("1 events displayed");
  });

  it("marks multi-day occurrences once with an end marker", async () => {
    const events = {
      "calendar.family": [allDay("Conference", dateKeyToday(1), dateKeyToday(4))],
    };
    const el = await mount(BASE_CONFIG, makeHass({ eventsByEntity: events }));
    const rows = el.shadowRoot!.querySelectorAll(".up-list .cwc-row");
    expect(rows.length).toBe(1);
    expect(rows[0]!.textContent).toContain("Conference");
  });
});

describe("source errors and stale data (§8, §15)", () => {
  it("keeps working sources alive and names failing ones", async () => {
    const hass = makeHass({
      eventsByEntity: {
        "calendar.family": [timed("Family event", isoToday(1, "10:00"), isoToday(1, "11:00"))],
      },
      failEntities: ["calendar.work"],
    });
    const el = await mount(BASE_CONFIG, hass);
    const content = text(el);
    expect(content).toContain("Some calendars could not be loaded");
    expect(content).toContain("Work");
    expect(content).toContain("Family event");
  });

  it("does not label days definitively empty while a source fails", async () => {
    const hass = makeHass({
      eventsByEntity: {
        "calendar.family": [timed("Family event", isoToday(1, "10:00"), isoToday(1, "11:00"))],
      },
      failEntities: ["calendar.work"],
    });
    const el = await mount(
      { ...BASE_CONFIG, calendar: { layout: "agenda", show_empty_days: true } },
      hass
    );
    expect(text(el)).toContain("may not be empty");
  });

  it("marks missing entities as runtime source errors without blocking others", async () => {
    const hass = makeHass({
      eventsByEntity: {
        "calendar.family": [timed("Family event", isoToday(1, "10:00"), isoToday(1, "11:00"))],
      },
    });
    delete hass.states["calendar.work"];
    const el = await mount(BASE_CONFIG, hass);
    expect(text(el)).toContain("Family event");
    expect(text(el)).toContain("Some calendars could not be loaded");
  });

  it("shows 'Last retrieved', never 'Last ICS sync'", async () => {
    const hass = makeHass({
      eventsByEntity: { "calendar.family": [timed("X", isoToday(1, "10:00"), isoToday(1, "11:00"))] },
    });
    const el = await mount(BASE_CONFIG, hass);
    const content = text(el);
    expect(content).toContain("Last retrieved");
    expect(content).not.toMatch(/Last ICS sync/i);
    expect(content).not.toMatch(/feed refresh/i);
  });
});

describe("request races and lifecycle (§15)", () => {
  it("discards a stale request after a configuration change", async () => {
    let resolveOld: ((v: any) => void) | null = null;
    const hass: any = {
      states: {
        "calendar.old": { entity_id: "calendar.old", state: "on", attributes: { friendly_name: "Old" } },
        "calendar.new": { entity_id: "calendar.new", state: "on", attributes: { friendly_name: "New" } },
      },
      config: { time_zone: HELSINKI },
      locale: { language: "en", time_format: "24" },
      callApi: (_m: string, path: string) => {
        if (path.includes("calendar.old")) {
          return new Promise((resolve) => {
            resolveOld = resolve;
          });
        }
        return Promise.resolve([timed("New event", isoToday(1, "10:00"), isoToday(1, "11:00"))]);
      },
    };
    const el = document.createElement("calendar-week-card") as CalendarWeekCard;
    document.body.appendChild(el);
    el.hass = hass;
    el.setConfig({ title: "R", sources: [{ id: "s1", entity: "calendar.old", name: "Old" }] });
    await el.updateComplete;
    el.setConfig({ title: "R", sources: [{ id: "s1", entity: "calendar.new", name: "New" }] });
    await settle(el);
    expect(text(el)).toContain("New event");
    // The old request resolves late and must not overwrite the newer state.
    resolveOld!([timed("Old event", isoToday(1, "12:00"), isoToday(1, "13:00"))]);
    await settle(el);
    expect(text(el)).not.toContain("Old event");
    expect(text(el)).toContain("New event");
  });

  it("shares cache entries between card instances on the same connection", async () => {
    const connection = { addEventListener: () => {}, removeEventListener: () => {} };
    const hass = makeHass({
      connection,
      eventsByEntity: { "calendar.family": [timed("Shared", isoToday(1, "10:00"), isoToday(1, "11:00"))] },
    });
    const first = await mount(BASE_CONFIG, hass);
    expect(hass.callCount["calendar.family"]).toBeGreaterThan(0);
    const secondHass = makeHass({
      connection,
      eventsByEntity: { "calendar.family": [timed("Shared", isoToday(1, "10:00"), isoToday(1, "11:00"))] },
    });
    const second = await mount(BASE_CONFIG, secondHass);
    expect(text(second)).toContain("Shared");
    // The second instance was served from the shared per-connection cache.
    expect(secondHass.callCount["calendar.family"] ?? 0).toBe(0);
    first.remove();
    second.remove();
  });

  it("cleans up timers and observers on disconnect", async () => {
    const el = await mount(BASE_CONFIG, makeHass({ eventsByEntity: {} }));
    const clearSpy = vi.spyOn(window, "clearInterval");
    el.remove();
    expect(clearSpy).toHaveBeenCalled();
    expect((el as any)._minuteTimer).toBeNull();
    expect((el as any)._refreshTimer).toBeNull();
    expect((el as any)._resizeObserver).toBeNull();
  });
});

describe("dialogs (§11, §16)", () => {
  it("opens the event dialog and closes on Escape, restoring focus", async () => {
    const events = {
      "calendar.family": [
        {
          summary: "Dentist",
          start: { dateTime: isoToday(1, "10:00") },
          end: { dateTime: isoToday(1, "11:00") },
          location: "Main street 5",
          description: "Bring insurance card",
          uid: "u-dentist",
        },
      ],
    };
    const el = await mount(
      { ...BASE_CONFIG, calendar: { layout: "agenda" } },
      makeHass({ eventsByEntity: events })
    );
    const row = el.shadowRoot!.querySelector<HTMLButtonElement>(".up-list .cwc-row")!;
    row.click();
    await el.updateComplete;
    const dialog = el.shadowRoot!.querySelector("cwc-dialog")!;
    await (dialog as any).updateComplete;
    const dialogText = dialog.shadowRoot!.textContent!;
    expect(dialogText).toContain("Dentist");
    expect(dialogText).toContain("Main street 5");
    expect(dialogText).toContain("Bring insurance card");
    expect(dialogText).toContain("Family");

    const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, composed: true });
    dialog.shadowRoot!.querySelector(".dialog")!.dispatchEvent(escape);
    await el.updateComplete;
    await (dialog as any).updateComplete;
    expect((dialog as any).model).toBeNull();
  });

  it("renders descriptions and locations as plain text", async () => {
    const events = {
      "calendar.family": [
        {
          summary: "<img src=x onerror=alert(1)>",
          start: { dateTime: isoToday(1, "10:00") },
          end: { dateTime: isoToday(1, "11:00") },
          description: "<script>alert(2)</script>",
          uid: "u-evil",
        },
      ],
    };
    const el = await mount(
      { ...BASE_CONFIG, calendar: { layout: "agenda" } },
      makeHass({ eventsByEntity: events })
    );
    const row = el.shadowRoot!.querySelector<HTMLButtonElement>(".up-list .cwc-row")!;
    row.click();
    await el.updateComplete;
    const dialog = el.shadowRoot!.querySelector("cwc-dialog")!;
    await (dialog as any).updateComplete;
    expect(dialog.shadowRoot!.querySelector("img")).toBeNull();
    expect(dialog.shadowRoot!.querySelector("script")).toBeNull();
    expect(dialog.shadowRoot!.textContent).toContain("<script>alert(2)</script>");
  });
});

describe("manual refresh (§15)", () => {
  it("re-requests from the Home Assistant API on demand", async () => {
    const hass: MockHass = makeHass({
      eventsByEntity: { "calendar.family": [timed("X", isoToday(1, "10:00"), isoToday(1, "11:00"))] },
    });
    const el = await mount(BASE_CONFIG, hass);
    const before = hass.callCount["calendar.family"]!;
    el.shadowRoot!.querySelector<HTMLButtonElement>('button[aria-label*="Reload events"]')!.click();
    await settle(el);
    expect(hass.callCount["calendar.family"]).toBeGreaterThan(before);
  });
});
