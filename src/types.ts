/**
 * Shared types for Calendar Week Card.
 *
 * The `CalendarEvent` shape is fixed by the implementation specification (§13).
 */

/** Raw `sources[]` entry as written in YAML. */
export interface SourceConfigInput {
  id?: string | null;
  entity?: string | null;
  name?: string | null;
  color?: string | null;
  icon?: string | null;
}

/** A validated `sources[]` entry. */
export interface SourceConfig {
  /** Unique, stable identifier. Preserved across renames/reorders. */
  id: string;
  /** Entity ID, always `calendar.*`. */
  entity: string;
  /** Display name; defaults to the entity friendly name, then the entity ID. */
  name: string | null;
  /** Six-digit hex color, or null meaning "assign a deterministic palette color". */
  color: string | null;
  /** Icon; defaults to `mdi:calendar`. */
  icon: string | null;
}

export type ViewMode = "calendar" | "upcoming" | "combined";
export type CombinedLayout = "calendar_top" | "list_top" | "side_by_side";
export type CalendarLayout = "auto" | "grid" | "agenda";
export type FirstDayOfWeek = "monday" | "sunday";
export type UpcomingDateFormat = "relative" | "absolute";
export type TimeFormatSetting = "auto" | "12" | "24";
/** `home_assistant` or a valid IANA timezone. */
export type TimezoneSetting = string;

export interface CalendarSectionConfig {
  layout: CalendarLayout;
  weeks_to_show: number;
  first_day_of_week: FirstDayOfWeek;
  show_week_numbers: boolean;
  highlight_current_week: boolean;
  highlight_today: boolean;
  show_empty_days: boolean;
  max_events_per_day: number;
}

export interface UpcomingSectionConfig {
  max_events: number;
  lookahead_days: number;
  date_format: UpcomingDateFormat;
  include_ongoing: boolean;
  follow_selected_week: boolean;
}

/** Fully normalized card configuration with all defaults applied. */
export interface CardConfig {
  title: string;
  view: ViewMode;
  combined_layout: CombinedLayout;
  timezone: TimezoneSetting;
  time_format: TimeFormatSetting;
  show_source_icons: boolean;
  show_source_names: boolean;
  show_location: boolean;
  show_end_time: boolean;
  calendar: CalendarSectionConfig;
  upcoming: UpcomingSectionConfig;
  sources: SourceConfig[];
}

/** Loose shape accepted by `setConfig` (nested sections may be omitted). */
export interface CardConfigInput {
  type?: string;
  title?: string;
  view?: string;
  combined_layout?: string;
  timezone?: string;
  time_format?: string;
  show_source_icons?: boolean;
  show_source_names?: boolean;
  show_location?: boolean;
  show_end_time?: boolean;
  calendar?: Partial<CalendarSectionConfig>;
  upcoming?: Partial<UpcomingSectionConfig>;
  sources?: SourceConfigInput[];
}

/**
 * Normalized event, per the implementation specification (§13).
 *
 * All-day events are date-only with a start-inclusive, end-exclusive end date.
 * Timed events are UTC epoch milliseconds with a start-inclusive, end-exclusive
 * end instant.
 */
export type CalendarEvent = {
  id: string;
  sourceId: string;
  title: string;
  location?: string;
  description?: string;
} & (
  | {
      allDay: true;
      /** `YYYY-MM-DD` in the display timezone. */
      startDate: string;
      /** Exclusive end date `YYYY-MM-DD` in the display timezone. */
      endDateExclusive: string;
    }
  | {
      allDay: false;
      /** UTC epoch milliseconds. */
      startMs: number;
      /** UTC epoch milliseconds, exclusive end. */
      endMs: number;
    }
);

/** Event shape returned by the Home Assistant calendar REST API. */
export interface ApiDateValue {
  date?: string;
  dateTime?: string;
}

export interface ApiEvent {
  summary?: string | null;
  start?: ApiDateValue | string | null;
  end?: ApiDateValue | string | null;
  description?: string | null;
  location?: string | null;
  uid?: string | null;
  recurrence_id?: string | null;
  rrule?: string | null;
  status?: "confirmed" | "tentative" | null;
}

export interface TimeRange {
  startMs: number;
  endMs: number;
}

/** Per-source runtime status (source errors never block other sources). */
export type SourceState = "loading" | "ready" | "empty" | "error";

export interface SourceStatus {
  sourceId: string;
  entity: string;
  state: SourceState;
  /** Human-readable error for `state === "error"`. */
  error?: string;
  /** Unix ms of the last successful API request for this source. */
  lastRetrievedAt?: number;
  /** Warning produced while normalizing events (malformed entries skipped). */
  warnings: string[];
}

/** Aggregated card status (§15). */
export type CardStatus = "loading" | "ready" | "empty" | "stale" | "error";

/** Minimal Home Assistant surface the card depends on. */
export interface HassLike {
  states: Record<string, { entity_id: string; state?: string; attributes?: Record<string, any> }>;
  config?: { time_zone?: string; location_name?: string };
  language?: string;
  locale?: { language?: string; time_format?: "12" | "24" | "language"; number_format?: string };
  formatEntityName?: (stateObj: any) => string;
  callApi<T = any>(method: string, path: string, parameters?: Record<string, any>): Promise<T>;
  connection?: {
    addEventListener(type: string, listener: () => void): void;
    removeEventListener(type: string, listener: () => void): void;
  };
}

export type DisplayTimeFormat = "12" | "24";
