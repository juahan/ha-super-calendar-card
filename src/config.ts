/**
 * Configuration validation and defaults (§5, §6).
 *
 * Pure functions only: no I/O, no mutation of the supplied configuration.
 */
import type {
  CalendarSectionConfig,
  CardConfig,
  CardConfigInput,
  SourceConfig,
  SourceConfigInput,
  UpcomingSectionConfig,
} from "./types";

export class ConfigError extends Error {
  readonly errors: string[];
  constructor(errors: string[]) {
    super(
      `Invalid calendar-week-card configuration:\n- ${errors.join("\n- ")}`
    );
    this.name = "ConfigError";
    this.errors = errors;
  }
}

export const DEFAULT_CALENDAR_SECTION: CalendarSectionConfig = {
  layout: "auto",
  weeks_to_show: 4,
  first_day_of_week: "monday",
  show_week_numbers: true,
  highlight_current_week: true,
  highlight_today: true,
  show_empty_days: true,
  max_events_per_day: 3,
};

export const DEFAULT_UPCOMING_SECTION: UpcomingSectionConfig = {
  max_events: 10,
  lookahead_days: 90,
  date_format: "relative",
  include_ongoing: true,
  follow_selected_week: false,
};

export const DEFAULT_CONFIG: CardConfig = {
  title: "Calendar",
  view: "combined",
  combined_layout: "calendar_top",
  timezone: "home_assistant",
  time_format: "auto",
  show_source_icons: true,
  show_source_names: false,
  show_location: false,
  show_end_time: false,
  calendar: DEFAULT_CALENDAR_SECTION,
  upcoming: DEFAULT_UPCOMING_SECTION,
  sources: [],
};

export const ENTITY_PREFIX = "calendar.";

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const ID_RE = /^[\w-]{1,64}$/;

/** Deterministic palette assigned when a source has no explicit color. */
export const SOURCE_PALETTE = [
  "#4CAF50",
  "#2196F3",
  "#FF9800",
  "#9C27B0",
  "#F44336",
  "#009688",
  "#795548",
  "#607D8B",
  "#E91E63",
  "#3F51B5",
];

/**
 * Stable palette color for a source without an explicit color.
 * Deterministic in `id` so it does not shift when sources are reordered.
 */
export function paletteColorFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return SOURCE_PALETTE[hash % SOURCE_PALETTE.length]!;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function checkBool(
  errors: string[],
  raw: Record<string, unknown>,
  key: string,
  fallback: boolean
): boolean {
  const value = raw[key];
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") {
    errors.push(`"${key}" must be true or false.`);
    return fallback;
  }
  return value;
}

function checkEnum<T extends string>(
  errors: string[],
  raw: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
  fallback: T
): T {
  const value = raw[key];
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    errors.push(`"${key}" must be one of: ${allowed.join(", ")}.`);
    return fallback;
  }
  return value as T;
}

function checkInt(
  errors: string[],
  raw: Record<string, unknown>,
  key: string,
  min: number,
  max: number,
  fallback: number
): number {
  const value = raw[key];
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    errors.push(`"${key}" must be an integer between ${min} and ${max}.`);
    return fallback;
  }
  return value;
}

function checkString(
  errors: string[],
  raw: Record<string, unknown>,
  key: string,
  fallback: string
): string {
  const value = raw[key];
  if (value === undefined) return fallback;
  if (typeof value !== "string") {
    errors.push(`"${key}" must be a string.`);
    return fallback;
  }
  return value;
}

/** Validate an IANA timezone, accepting `home_assistant`. */
export function isValidTimezone(value: string): boolean {
  if (value === "home_assistant") return true;
  if (typeof value !== "string" || value.length === 0) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export interface ValidationResult {
  config: CardConfig | null;
  errors: string[];
}

/**
 * Validate raw YAML and produce a normalized configuration.
 * Never mutates `raw`. Returns `config: null` when errors were found.
 */
export function validateConfig(raw: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isRecord(raw)) {
    return { config: null, errors: ["Configuration must be an object."] };
  }

  const title = checkString(errors, raw, "title", DEFAULT_CONFIG.title);
  const view = checkEnum(
    errors,
    raw,
    "view",
    ["calendar", "upcoming", "combined"] as const,
    DEFAULT_CONFIG.view
  );
  const combined_layout = checkEnum(
    errors,
    raw,
    "combined_layout",
    ["calendar_top", "list_top", "side_by_side"] as const,
    DEFAULT_CONFIG.combined_layout
  );

  const timezoneRaw = checkString(errors, raw, "timezone", DEFAULT_CONFIG.timezone);
  if (!isValidTimezone(timezoneRaw)) {
    errors.push(
      `"timezone" must be "home_assistant" or a valid IANA timezone (got "${timezoneRaw}").`
    );
  }
  const timezone = isValidTimezone(timezoneRaw) ? timezoneRaw : DEFAULT_CONFIG.timezone;

  const time_format = checkEnum(
    errors,
    raw,
    "time_format",
    ["auto", "12", "24"] as const,
    DEFAULT_CONFIG.time_format
  );

  // Calendar section.
  const calendarRaw = raw["calendar"] ?? {};
  if (!isRecord(calendarRaw)) {
    errors.push(`"calendar" must be an object.`);
  }
  const c = isRecord(calendarRaw) ? calendarRaw : {};
  const calendar: CalendarSectionConfig = {
    layout: checkEnum(errors, c, "layout", ["auto", "grid", "agenda"] as const, DEFAULT_CALENDAR_SECTION.layout),
    weeks_to_show: checkInt(errors, c, "weeks_to_show", 1, 12, DEFAULT_CALENDAR_SECTION.weeks_to_show),
    first_day_of_week: checkEnum(
      errors,
      c,
      "first_day_of_week",
      ["monday", "sunday"] as const,
      DEFAULT_CALENDAR_SECTION.first_day_of_week
    ),
    show_week_numbers: checkBool(errors, c, "show_week_numbers", DEFAULT_CALENDAR_SECTION.show_week_numbers),
    highlight_current_week: checkBool(
      errors,
      c,
      "highlight_current_week",
      DEFAULT_CALENDAR_SECTION.highlight_current_week
    ),
    highlight_today: checkBool(errors, c, "highlight_today", DEFAULT_CALENDAR_SECTION.highlight_today),
    show_empty_days: checkBool(errors, c, "show_empty_days", DEFAULT_CALENDAR_SECTION.show_empty_days),
    max_events_per_day: checkInt(
      errors,
      c,
      "max_events_per_day",
      1,
      20,
      DEFAULT_CALENDAR_SECTION.max_events_per_day
    ),
  };

  // Upcoming section.
  const upcomingRaw = raw["upcoming"] ?? {};
  if (!isRecord(upcomingRaw)) {
    errors.push(`"upcoming" must be an object.`);
  }
  const u = isRecord(upcomingRaw) ? upcomingRaw : {};
  const upcoming: UpcomingSectionConfig = {
    max_events: checkInt(errors, u, "max_events", 1, 50, DEFAULT_UPCOMING_SECTION.max_events),
    lookahead_days: checkInt(errors, u, "lookahead_days", 1, 366, DEFAULT_UPCOMING_SECTION.lookahead_days),
    date_format: checkEnum(
      errors,
      u,
      "date_format",
      ["relative", "absolute"] as const,
      DEFAULT_UPCOMING_SECTION.date_format
    ),
    include_ongoing: checkBool(errors, u, "include_ongoing", DEFAULT_UPCOMING_SECTION.include_ongoing),
    follow_selected_week: checkBool(
      errors,
      u,
      "follow_selected_week",
      DEFAULT_UPCOMING_SECTION.follow_selected_week
    ),
  };

  // Display toggles.
  const show_source_icons = checkBool(errors, raw, "show_source_icons", DEFAULT_CONFIG.show_source_icons);
  const show_source_names = checkBool(errors, raw, "show_source_names", DEFAULT_CONFIG.show_source_names);
  const show_location = checkBool(errors, raw, "show_location", DEFAULT_CONFIG.show_location);
  const show_end_time = checkBool(errors, raw, "show_end_time", DEFAULT_CONFIG.show_end_time);

  // Sources.
  const sourcesRaw = raw["sources"];
  const sources: SourceConfig[] = [];
  if (sourcesRaw === undefined) {
    errors.push(`"sources" is required and must be a nonempty list of calendar entities.`);
  } else if (!Array.isArray(sourcesRaw)) {
    errors.push(`"sources" must be a list of calendar entities.`);
  } else if (sourcesRaw.length === 0) {
    errors.push(`"sources" must contain at least one calendar entity.`);
  } else {
    const seenIds = new Set<string>();
    const seenEntities = new Set<string>();
    sourcesRaw.forEach((entry: unknown, index: number) => {
      const where = `sources[${index}]`;
      if (!isRecord(entry)) {
        errors.push(`${where} must be an object with at least an "entity".`);
        return;
      }
      const s = entry as SourceConfigInput;
      const entity = typeof s.entity === "string" ? s.entity.trim() : "";
      if (!entity) {
        errors.push(`${where} is missing "entity" (a calendar entity ID).`);
        return;
      }
      if (!entity.startsWith(ENTITY_PREFIX)) {
        errors.push(
          `${where}: "${entity}" is not a calendar entity (entity IDs must begin with "${ENTITY_PREFIX}").`
        );
        return;
      }
      if (seenEntities.has(entity)) {
        errors.push(`${where}: duplicate entity "${entity}" — each entity may only appear once.`);
        return;
      }
      seenEntities.add(entity);

      const id = typeof s.id === "string" ? s.id.trim() : "";
      if (!id) {
        errors.push(`${where} is missing "id" (a unique, stable string identifier).`);
        return;
      }
      if (!ID_RE.test(id)) {
        errors.push(`${where}: id "${id}" may only contain letters, digits, "_" and "-".`);
        return;
      }
      if (seenIds.has(id)) {
        errors.push(`${where}: duplicate source id "${id}" — source ids must be unique.`);
        return;
      }
      seenIds.add(id);

      let color: string | null = null;
      if (s.color !== undefined && s.color !== null) {
        if (typeof s.color !== "string" || !HEX_COLOR_RE.test(s.color.trim())) {
          errors.push(`${where}: color "${String(s.color)}" must be a six-digit hex color like "#4CAF50".`);
        } else {
          color = s.color.trim().toLowerCase();
        }
      }

      let name: string | null = null;
      if (s.name !== undefined && s.name !== null) {
        if (typeof s.name !== "string") {
          errors.push(`${where}: "name" must be a string.`);
        } else if (s.name.trim() !== "") {
          name = s.name.trim();
        }
      }

      let icon: string | null = null;
      if (s.icon !== undefined && s.icon !== null) {
        if (typeof s.icon !== "string" || s.icon.trim() === "") {
          errors.push(`${where}: "icon" must be a nonempty icon name like "mdi:calendar".`);
        } else {
          icon = s.icon.trim();
        }
      }

      sources.push({ id, entity, name, color, icon });
    });
  }

  if (errors.length > 0) {
    return { config: null, errors };
  }

  return {
    config: {
      title,
      view,
      combined_layout,
      timezone,
      time_format,
      show_source_icons,
      show_source_names,
      show_location,
      show_end_time,
      calendar,
      upcoming,
      sources,
    },
    errors: [],
  };
}

/** Validate raw YAML, throwing an actionable `ConfigError` when invalid. */
export function parseConfig(raw: unknown): CardConfig {
  const result = validateConfig(raw);
  if (!result.config) {
    throw new ConfigError(result.errors);
  }
  return result.config;
}

/**
 * Editor round-tripping: serialize a normalized config back to a plain
 * configuration object. Values equal to defaults are kept explicit so that the
 * editor round-trips what the user saw.
 */
export function configToPlain(config: CardConfig): CardConfigInput {
  return {
    type: "custom:calendar-week-card",
    title: config.title,
    view: config.view,
    combined_layout: config.combined_layout,
    timezone: config.timezone,
    time_format: config.time_format,
    show_source_icons: config.show_source_icons,
    show_source_names: config.show_source_names,
    show_location: config.show_location,
    show_end_time: config.show_end_time,
    calendar: { ...config.calendar },
    upcoming: { ...config.upcoming },
    sources: config.sources.map((s) => ({
      id: s.id,
      entity: s.entity,
      ...(s.name !== null ? { name: s.name } : {}),
      ...(s.color !== null ? { color: s.color } : {}),
      ...(s.icon !== null ? { icon: s.icon } : {}),
    })),
  };
}

/** Generate a fresh unique source id for editor "add source" actions. */
export function generateSourceId(existing: Iterable<string>): string {
  const taken = new Set(existing);
  let candidate: string;
  do {
    const suffix = Math.random().toString(36).slice(2, 8);
    candidate = `source-${suffix}`;
  } while (taken.has(candidate));
  return candidate;
}

/** Resolve the display name of a source (config name → friendly name → entity). */
export function sourceDisplayName(
  source: SourceConfig,
  friendlyName: string | null | undefined
): string {
  return source.name ?? (friendlyName && friendlyName.trim() !== "" ? friendlyName : source.entity);
}
