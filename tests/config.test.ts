import { describe, expect, it } from "vitest";
import {
  ConfigError,
  DEFAULT_CALENDAR_SECTION,
  DEFAULT_UPCOMING_SECTION,
  configToPlain,
  generateSourceId,
  paletteColorFor,
  parseConfig,
  validateConfig,
} from "../src/config";

const MINIMAL = {
  sources: [{ id: "family", entity: "calendar.family" }],
};

describe("config defaults (§6)", () => {
  it("applies all defaults for a minimal configuration", () => {
    const config = parseConfig(MINIMAL);
    expect(config.title).toBe("Calendar");
    expect(config.view).toBe("combined");
    expect(config.combined_layout).toBe("calendar_top");
    expect(config.timezone).toBe("home_assistant");
    expect(config.time_format).toBe("auto");
    expect(config.show_source_icons).toBe(true);
    expect(config.show_source_names).toBe(false);
    expect(config.show_location).toBe(false);
    expect(config.show_end_time).toBe(false);
    expect(config.calendar).toEqual(DEFAULT_CALENDAR_SECTION);
    expect(config.upcoming).toEqual(DEFAULT_UPCOMING_SECTION);
    expect(config.sources).toEqual([
      { id: "family", entity: "calendar.family", name: null, color: null, icon: null },
    ]);
  });

  it("does not mutate the supplied configuration (frozen input)", () => {
    const input = Object.freeze({
      ...MINIMAL,
      calendar: Object.freeze({ weeks_to_show: 2 }),
      upcoming: Object.freeze({ max_events: 5 }),
    });
    const config = parseConfig(input);
    expect(input.calendar).toEqual({ weeks_to_show: 2 });
    expect(input.upcoming).toEqual({ max_events: 5 });
    expect(config.calendar.weeks_to_show).toBe(2);
    expect(config.upcoming.max_events).toBe(5);
  });

  it("keeps omitted nested sections at their defaults", () => {
    const config = parseConfig({ ...MINIMAL, calendar: {}, upcoming: {} });
    expect(config.calendar).toEqual(DEFAULT_CALENDAR_SECTION);
    expect(config.upcoming).toEqual(DEFAULT_UPCOMING_SECTION);
  });

  it("accepts optional source fields", () => {
    const config = parseConfig({
      sources: [
        {
          id: "work",
          entity: "calendar.work",
          name: "Work",
          color: "#2196F3",
          icon: "mdi:briefcase",
        },
      ],
    });
    expect(config.sources[0]).toEqual({
      id: "work",
      entity: "calendar.work",
      name: "Work",
      color: "#2196f3",
      icon: "mdi:briefcase",
    });
  });
});

describe("config validation (§6)", () => {
  const cases: Array<[string, unknown, RegExp]> = [
    ["missing sources", {}, /sources/i],
    ["empty sources", { sources: [] }, /at least one/i],
    ["non-object", "nope", /object/i],
    ["URL source rejected", { sources: [{ id: "a", entity: "https://example.com/x.ics" }] }, /calendar entity/i],
    ["non-calendar entity", { sources: [{ id: "a", entity: "sensor.temp" }] }, /calendar\./i],
    [
      "duplicate entity",
      { sources: [{ id: "a", entity: "calendar.x" }, { id: "b", entity: "calendar.x" }] },
      /duplicate entity/i,
    ],
    [
      "duplicate id",
      { sources: [{ id: "a", entity: "calendar.x" }, { id: "a", entity: "calendar.y" }] },
      /duplicate source id/i,
    ],
    ["missing id", { sources: [{ entity: "calendar.x" }] }, /missing "id"/i],
    ["missing entity", { sources: [{ id: "a" }] }, /missing "entity"/i],
    [
      "bad color",
      { sources: [{ id: "a", entity: "calendar.x", color: "green" }] },
      /six-digit hex/i,
    ],
    ["bad view", { ...MINIMAL, view: "agenda" }, /"view"/i],
    ["bad weeks_to_show", { ...MINIMAL, calendar: { weeks_to_show: 13 } }, /weeks_to_show/i],
    ["weeks_to_show zero", { ...MINIMAL, calendar: { weeks_to_show: 0 } }, /weeks_to_show/i],
    ["bad max_events", { ...MINIMAL, upcoming: { max_events: 51 } }, /max_events/i],
    ["bad lookahead", { ...MINIMAL, upcoming: { lookahead_days: 0 } }, /lookahead_days/i],
    ["fractional int", { ...MINIMAL, calendar: { max_events_per_day: 2.5 } }, /max_events_per_day/i],
    ["bad timezone", { ...MINIMAL, timezone: "Not/AZone" }, /timezone/i],
    ["bad time_format", { ...MINIMAL, time_format: "32" }, /time_format/i],
    ["bad boolean", { ...MINIMAL, show_location: "yes" }, /show_location/i],
  ];

  for (const [name, raw, pattern] of cases) {
    it(`rejects ${name} with an actionable error`, () => {
      const result = validateConfig(raw);
      expect(result.config).toBeNull();
      expect(result.errors.join("\n")).toMatch(pattern);
    });
  }

  it("parseConfig throws ConfigError listing every problem", () => {
    let thrown: unknown;
    try {
      parseConfig({ sources: [{ id: "a", entity: "sensor.x" }], view: "nope" });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(ConfigError);
    const error = thrown as ConfigError;
    expect(error.errors.length).toBeGreaterThanOrEqual(2);
    expect(error.message).toMatch(/calendar-week-card configuration/);
  });

  it("accepts home_assistant and IANA timezones", () => {
    expect(validateConfig({ ...MINIMAL, timezone: "home_assistant" }).config).not.toBeNull();
    expect(validateConfig({ ...MINIMAL, timezone: "Europe/Helsinki" }).config).not.toBeNull();
    expect(validateConfig({ ...MINIMAL, timezone: "America/New_York" }).config).not.toBeNull();
  });
});

describe("editor round-tripping (§16)", () => {
  it("configToPlain → validateConfig round-trips exactly", () => {
    const raw = {
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
        { id: "work", entity: "calendar.work", name: null, color: null, icon: null },
      ],
    };
    const config = parseConfig(raw);
    const plain = configToPlain(config);
    const again = parseConfig(plain);
    expect(again).toEqual(config);
    expect(plain.type).toBe("custom:calendar-week-card");
  });

  it("generates unique source ids", () => {
    const existing = new Set(["source-abc"]);
    const id = generateSourceId(existing);
    expect(id).not.toBe("source-abc");
    expect(generateSourceId([id])).not.toBe(id);
  });

  it("assigns deterministic palette colors", () => {
    expect(paletteColorFor("family")).toBe(paletteColorFor("family"));
    expect(paletteColorFor("family")).toMatch(/^#[0-9A-F]{6}$/i);
  });
});
