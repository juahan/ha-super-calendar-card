/** View models passed from the card to the rendering templates. */
import type { DateTime } from "luxon";
import type { FormatContext } from "../dates";
import type { CalendarEvent, CardConfig } from "../types";
import type { SourceViewInfo } from "./event-parts";

export type { SourceViewInfo };

export interface CalendarViewData {
  config: CardConfig;
  fmt: FormatContext;
  /** One entry per displayed week; each is seven consecutive days. */
  weeks: DateTime[][];
  /** Sorted events per day key. */
  eventsOfDay: Map<string, CalendarEvent[]>;
  sources: Map<string, SourceViewInfo>;
  todayKey: string;
  /** Week-start key of the current week, if displayed. */
  currentWeekKey: string | null;
  /** Week-start key of the selected week (§10). */
  selectedWeekKey: string | null;
  /** Header label for the displayed date range. */
  rangeLabel: string;
  /** Resolved presentation: "grid" or "agenda". */
  layout: "grid" | "agenda";
  /** `calendar.layout: grid` in a narrow container → horizontal scrolling. */
  gridForced: boolean;
  /** Names of sources whose latest request failed (§8). */
  sourceErrorNames: string[];
}

export interface CalendarActions {
  onPrevWeek(): void;
  onNextWeek(): void;
  onToday(): void;
  onWeekSelect(weekStartKey: string): void;
  onEventOpen(event: CalendarEvent): void;
  onDayMore(dayKey: string): void;
}

export interface UpcomingViewData {
  config: CardConfig;
  fmt: FormatContext;
  /** Heading: "Upcoming" or the selected week's date range (§10). */
  heading: string;
  /** Events to display, already limited. */
  events: CalendarEvent[];
  sources: Map<string, SourceViewInfo>;
  /** IDs of ongoing events (for the "In progress" indicator, §11). */
  ongoingIds: Set<string>;
  /** Total occurrences before the limit (for "Show all N events"). */
  totalAvailable: number;
  /** Empty-state message (horizon-based, §9). */
  emptyMessage: string;
  showClearSelection: boolean;
  showAllLabel: string | null;
  loading: boolean;
  lastRetrievedAt: number | null;
}

export interface UpcomingActions {
  onEventOpen(event: CalendarEvent): void;
  onClearSelection(): void;
  onShowAll(): void;
}
