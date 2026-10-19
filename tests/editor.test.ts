import { describe, expect, it } from "vitest";
import "../src/index";
import type { CalendarWeekCardEditor } from "../src/editor";
import { makeHass } from "./helpers";

type Editor = CalendarWeekCardEditor;

async function mountEditor(config: unknown, hass = makeHass({
  eventsByEntity: {
    "calendar.family": [],
    "calendar.work": [],
    "calendar.sports": [],
  },
})): Promise<Editor> {
  const el = document.createElement("calendar-week-card-editor") as Editor;
  el.hass = hass;
  document.body.appendChild(el);
  el.setConfig(config as any);
  await el.updateComplete;
  await el.updateComplete;
  return el;
}

function capturedEvents(el: Editor): any[] {
  const seen: any[] = [];
  el.addEventListener("config-changed", (event) => {
    seen.push((event as CustomEvent).detail.config);
  });
  return seen;
}

function fieldByLabel(el: Editor, label: string): Element | null {
  return [...el.shadowRoot!.querySelectorAll("label.field")].find((node) =>
    node.textContent!.includes(label)
  ) ?? null;
}

function inputFor(el: Editor, label: string): HTMLInputElement | HTMLSelectElement {
  const field = fieldByLabel(el, label);
  if (!field) throw new Error(`Field not found: ${label}`);
  return field.querySelector("input, select") as HTMLInputElement | HTMLSelectElement;
}

describe("visual editor (§16)", () => {
  it("emits complete config-changed events without mutating the input object", async () => {
    const input = {
      title: "Household",
      view: "combined",
      combined_layout: "calendar_top",
      sources: [{ id: "family", entity: "calendar.family" }],
    };
    const frozen = JSON.parse(JSON.stringify(input));
    Object.freeze(input);
    Object.freeze(input.sources);
    Object.freeze(input.sources[0]);
    const el = await mountEditor(input);
    const seen = capturedEvents(el);
    const title = inputFor(el, "Card title") as HTMLInputElement;
    title.value = "Renamed";
    title.dispatchEvent(new Event("input", { bubbles: true }));
    expect(seen).toHaveLength(1);
    expect(seen[0].title).toBe("Renamed");
    // Complete config: every setting is present in the emitted object.
    for (const key of [
      "view",
      "combined_layout",
      "timezone",
      "time_format",
      "show_source_icons",
      "show_source_names",
      "show_location",
      "show_end_time",
      "calendar",
      "upcoming",
      "sources",
    ]) {
      expect(seen[0]).toHaveProperty(key);
    }
    // Input object untouched.
    expect(input).toEqual(frozen);
  });

  it("round-trips configuration through the editor", async () => {
    const config = {
      title: "Household",
      view: "combined",
      combined_layout: "side_by_side",
      timezone: "Europe/Helsinki",
      time_format: "24",
      show_source_icons: true,
      show_source_names: true,
      show_location: true,
      show_end_time: true,
      calendar: {
        layout: "agenda",
        weeks_to_show: 6,
        first_day_of_week: "sunday",
        show_week_numbers: false,
        highlight_current_week: false,
        highlight_today: true,
        show_empty_days: false,
        max_events_per_day: 7,
      },
      upcoming: {
        max_events: 25,
        lookahead_days: 30,
        date_format: "absolute",
        include_ongoing: false,
        follow_selected_week: true,
      },
      sources: [
        { id: "family", entity: "calendar.family", name: "Family", color: "#4caf50", icon: "mdi:account-group" },
      ],
    };
    const el = await mountEditor(config);
    const seen = capturedEvents(el);
    // Touch one field to trigger an emission of the complete configuration.
    const title = inputFor(el, "Card title") as HTMLInputElement;
    title.value = "Household";
    title.dispatchEvent(new Event("input", { bubbles: true }));
    const emitted = seen[0];
    expect(emitted.view).toBe("combined");
    expect(emitted.combined_layout).toBe("side_by_side");
    expect(emitted.timezone).toBe("Europe/Helsinki");
    expect(emitted.calendar).toEqual(config.calendar);
    expect(emitted.upcoming).toEqual(config.upcoming);
    expect(emitted.sources[0].id).toBe("family");
    expect(emitted.sources[0].color).toBe("#4caf50");
  });

  it("preserves settings of temporarily hidden views", async () => {
    const el = await mountEditor({
      view: "combined",
      combined_layout: "list_top",
      upcoming: { max_events: 25 },
      sources: [{ id: "family", entity: "calendar.family" }],
    });
    const seen = capturedEvents(el);
    const view = inputFor(el, "View") as HTMLSelectElement;
    view.value = "calendar";
    view.dispatchEvent(new Event("change", { bubbles: true }));
    expect(seen[0].view).toBe("calendar");
    // combined_layout is not visible for view: calendar, but it is preserved.
    expect(seen[0].combined_layout).toBe("list_top");
    expect(seen[0].upcoming.max_events).toBe(25);
  });

  it("lists only calendar.* entities in the entity selector", async () => {
    const hass = makeHass({
      eventsByEntity: { "calendar.family": [], "calendar.work": [] },
      friendlyNames: { "sensor.temperature": "Temperature" },
    });
    const el = await mountEditor({ sources: [{ id: "a", entity: "calendar.family" }] }, hass);
    const options = [
      ...el.shadowRoot!.querySelectorAll<HTMLSelectElement>("select option"),
    ].map((o) => o.value);
    expect(options).toContain("calendar.family");
    expect(options).toContain("calendar.work");
    expect(options).not.toContain("sensor.temperature");
  });

  it("generates source ids when adding and preserves them on rename and reorder", async () => {
    const el = await mountEditor({
      sources: [
        { id: "keep-me", entity: "calendar.family", name: "Family" },
        { id: "keep-me-2", entity: "calendar.work", name: "Work" },
      ],
    });
    const seen = capturedEvents(el);
    const add = [...el.shadowRoot!.querySelectorAll("button")].find((b) =>
      b.textContent!.includes("Add calendar")
    )!;
    add.click();
    const afterAdd = seen[seen.length - 1];
    expect(afterAdd.sources).toHaveLength(3);
    expect(afterAdd.sources[2].id).toBeTruthy();
    expect(new Set(afterAdd.sources.map((s: any) => s.id)).size).toBe(3);

    // Rename the first source (text input inside its row).
    const rows = [...el.shadowRoot!.querySelectorAll(".source-row")];
    const nameInput = rows[0]!.querySelectorAll("input[type='text']")[1] as HTMLInputElement;
    nameInput.value = "Family renamed";
    nameInput.dispatchEvent(new Event("input", { bubbles: true }));
    const afterRename = seen[seen.length - 1];
    expect(afterRename.sources[0].id).toBe("keep-me");
    expect(afterRename.sources[0].name).toBe("Family renamed");

    // Move it down.
    const down = rows[0]!.querySelectorAll("button")[1] as HTMLButtonElement;
    down.click();
    const afterMove = seen[seen.length - 1];
    expect(afterMove.sources.map((s: any) => s.id)).toEqual(["keep-me-2", "keep-me", afterAdd.sources[2].id]);
  });

  it("removes sources", async () => {
    const el = await mountEditor({
      sources: [
        { id: "a", entity: "calendar.family" },
        { id: "b", entity: "calendar.work" },
      ],
    });
    const seen = capturedEvents(el);
    const rows = [...el.shadowRoot!.querySelectorAll(".source-row")];
    const remove = rows[0]!.querySelectorAll("button")[2] as HTMLButtonElement;
    remove.click();
    expect(seen[0].sources.map((s: any) => s.id)).toEqual(["b"]);
  });

  it("exposes calendar and upcoming settings", async () => {
    const el = await mountEditor({ sources: [{ id: "a", entity: "calendar.family" }] });
    for (const label of [
      "Weeks to show",
      "First day of week",
      "Show week numbers",
      "Highlight current week",
      "Highlight today",
      "Show empty days",
      "Maximum events per day",
      "Maximum events",
      "Lookahead (days)",
      "Date format",
      "Include ongoing events",
      "Filter list to the selected week",
      "Timezone",
      "Time format",
    ]) {
      expect(fieldByLabel(el, label), `missing field: ${label}`).toBeTruthy();
    }
  });

  it("provides Remote Calendar setup guidance", async () => {
    const el = await mountEditor({ sources: [{ id: "a", entity: "calendar.family" }] });
    const help = el.shadowRoot!.textContent!;
    expect(help).toContain("Remote Calendar");
    expect(help).toContain("never downloads ICS files itself");
  });

  it("tests a source connection through the same adapter (empty result is valid)", async () => {
    const hass = makeHass({ eventsByEntity: { "calendar.family": [] } });
    const el = await mountEditor({ sources: [{ id: "a", entity: "calendar.family" }] }, hass);
    const rows = [...el.shadowRoot!.querySelectorAll(".source-row")];
    const test = [...rows[0]!.querySelectorAll("button")].find((b) =>
      b.textContent!.includes("Test connection")
    )!;
    test.click();
    await new Promise((resolve) => setTimeout(resolve, 10));
    await el.updateComplete;
    expect(el.shadowRoot!.textContent).toContain("Connected — no events");

    const failing = makeHass({ failEntities: ["calendar.family"] });
    const el2 = await mountEditor({ sources: [{ id: "a", entity: "calendar.family" }] }, failing);
    const rows2 = [...el2.shadowRoot!.querySelectorAll(".source-row")];
    const test2 = [...rows2[0]!.querySelectorAll("button")].find((b) =>
      b.textContent!.includes("Test connection")
    )!;
    test2.click();
    await new Promise((resolve) => setTimeout(resolve, 10));
    await el2.updateComplete;
    expect(el2.shadowRoot!.textContent).toContain("Connection failed");
  });

  it("shows validation errors for invalid input while still emitting", async () => {
    const el = await mountEditor({ sources: [{ id: "a", entity: "calendar.family" }] });
    const seen = capturedEvents(el);
    const entitySelect = el.shadowRoot!.querySelector("select") as HTMLSelectElement;
    // Break the timezone instead (entity selector only offers valid entities).
    const tz = inputFor(el, "Timezone") as HTMLInputElement;
    tz.value = "Not/AZone";
    tz.dispatchEvent(new Event("input", { bubbles: true }));
    void entitySelect;
    await el.updateComplete;
    await el.updateComplete;
    expect(seen.length).toBeGreaterThan(0);
    expect(el.shadowRoot!.textContent).toContain("Not/AZone");
  });
});
