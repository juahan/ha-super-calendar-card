/**
 * Calendar Week Card — the card element (§4, §7–§15).
 *
 * Composition (view arrangement) is handled here and stays separate from
 * calendar presentation (grid/agenda). The upcoming horizon is independent of
 * the displayed calendar range.
 */
import { css, html, nothing, type TemplateResult } from "lit";
import { LitElement, type PropertyValues } from "lit";
import { property, state } from "lit/decorators.js";
import { DateTime } from "luxon";
import { getCacheForHass } from "./cache";
import {
  configToPlain,
  generateSourceId,
  parseConfig,
  paletteColorFor,
  sourceDisplayName,
} from "./config";
import {
  addCalendarDays,
  dateToKey,
  formatDate,
  formatLastRetrieved,
  keyFromMillis,
  keyToDate,
  rangeHeaderLabel,
  resolveDisplayTimezone,
  resolveTimeFormat,
  startOfWeek,
  type FormatContext,
} from "./dates";
import {
  dedupeWithinSource,
  isOngoing,
  normalizeApiEvents,
  occursOnDay,
  overlapsRange,
  selectUpcoming,
  selectWeekEvents,
  sortForUpcoming,
  sourceOrderFrom,
  eventsForDay,
  type SourceOrder,
} from "./events";
import { planRanges } from "./ranges";
import { STRINGS } from "./strings";
import { sharedStyles } from "./styles";
import type {
  CalendarEvent,
  CardConfig,
  CardStatus,
  HassLike,
  SourceConfig,
  SourceStatus,
  TimeRange,
} from "./types";
import { renderCalendarView, calendarViewStyles } from "./views/calendar-view";
import { CwcDialog, type DialogModel } from "./views/dialogs";
import { ICON_REFRESH, ICON_WARNING } from "./views/icons";
import { renderUpcomingList, upcomingStyles } from "./views/upcoming-list";
import type {
  CalendarActions,
  CalendarViewData,
  SourceViewInfo,
  UpcomingActions,
  UpcomingViewData,
} from "./views/view-types";

/** Side-by-side stacking threshold (§4). */
export const SIDE_BY_SIDE_MIN_CARD_WIDTH = 1100;
/** Grid/agenda auto threshold (§8). */
export const GRID_MIN_CALENDAR_WIDTH = 840;
/** Active ranges refresh cadence (§15). */
export const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
/** A returning page is considered stale after this long without a fetch. */
export const STALE_AFTER_MS = 60 * 1000;

export class CalendarWeekCard extends LitElement {
  @property({ attribute: false }) hass!: HassLike;
  /** Set to true when rendered inside the card editor. */
  @property({ type: Boolean }) preview = false;

  @state() private _config: CardConfig | null = null;

  // Transient UI state — never written to YAML (§10).
  @state() private _anchorKey: string | null = null;
  @state() private _selectedWeekKey: string | null = null;
  @state() private _showAllSelectedWeek = false;
  @state() private _followingCurrentWeek = true;
  @state() private _nowMs = Date.now();
  @state() private _loading = false;
  @state() private _dialogModel: DialogModel | null = null;
  @state() private _cardWidth = 0;
  @state() private _calendarWidth = 0;

  private _eventsBySource = new Map<string, CalendarEvent[]>();
  private _sourceStates = new Map<string, SourceStatus>();
  private _lastRetrievedAt: number | null = null;
  private _generation = 0;

  private _minuteTimer: number | null = null;
  private _refreshTimer: number | null = null;
  private _resizeObserver: ResizeObserver | null = null;
  private _observedCalendarEl: Element | null = null;
  private _boundVisibility = () => this._onVisibilityChange();
  private _boundReconnect = () => void this._refresh({ force: true });
  private _connection: HassLike["connection"] | null = null;

  // ------------------------------------------------------------------
  // Card API
  // ------------------------------------------------------------------

  setConfig(input: unknown): void {
    // Validation produces an actionable configuration error (§6).
    this._config = parseConfig(input);
    for (const id of [...this._eventsBySource.keys()]) {
      if (!this._config.sources.some((s) => s.id === id)) {
        this._eventsBySource.delete(id);
        this._sourceStates.delete(id);
      }
    }
    for (const source of this._config.sources) {
      if (!this._sourceStates.has(source.id)) {
        this._sourceStates.set(source.id, {
          sourceId: source.id,
          entity: source.entity,
          state: "loading",
          warnings: [],
        });
      }
    }
    this._selectedWeekKey = null;
    this._showAllSelectedWeek = false;
    void this._refresh();
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this._startTimers();
    document.addEventListener("visibilitychange", this._boundVisibility);
    this._setupResizeObserver();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this._stopTimers();
    document.removeEventListener("visibilitychange", this._boundVisibility);
    this._resizeObserver?.disconnect();
    this._resizeObserver = null;
    this._observedCalendarEl = null;
    this._setConnection(null);
    this._generation += 1;
  }

  override firstUpdated(): void {
    this._setupResizeObserver();
    void this._refresh();
  }

  override updated(): void {
    // The calendar panel element can reappear (view/layout changes).
    const panel = this.renderRoot.querySelector(".cwc-calsurface");
    if (panel && panel !== this._observedCalendarEl) {
      this._resizeObserver?.observe(panel);
      this._observedCalendarEl = panel;
    }
  }

  protected override willUpdate(changed: PropertyValues): void {
    if (changed.has("hass")) {
      this._setConnection(this.hass?.connection ?? null);
    }
    if (changed.has("hass") && this._config) {
      // Friendly names / availability may have changed; schedule a light update
      // of source runtime status without touching event data.
      this._updateUnavailableSources();
    }
  }

  // ------------------------------------------------------------------
  // Timers, visibility, reconnection (§15)
  // ------------------------------------------------------------------

  private _startTimers(): void {
    if (this._minuteTimer === null) {
      this._minuteTimer = window.setInterval(() => this._tickMinute(), 30000);
    }
    this._ensureRefreshTimer();
  }

  private _ensureRefreshTimer(): void {
    if (this._refreshTimer !== null) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    this._refreshTimer = window.setInterval(() => {
      void this._refresh({ force: true });
    }, REFRESH_INTERVAL_MS);
  }

  private _stopTimers(): void {
    if (this._minuteTimer !== null) {
      window.clearInterval(this._minuteTimer);
      this._minuteTimer = null;
    }
    if (this._refreshTimer !== null) {
      window.clearInterval(this._refreshTimer);
      this._refreshTimer = null;
    }
  }

  private _tickMinute(): void {
    const previous = this._nowMs;
    this._nowMs = Date.now();
    const zone = this._displayZone();
    const previousDay = keyFromMillis(previous, zone);
    const currentDay = keyFromMillis(this._nowMs, zone);
    if (previousDay === currentDay) return;
    // Recompute date-dependent labels at local midnight (§14) and advance the
    // calendar at a week boundary only when it follows the current week (§14).
    const config = this._config;
    if (!config) return;
    const firstDay = config.calendar.first_day_of_week;
    const previousWeek = dateToKey(startOfWeek(keyToDate(previousDay, zone), firstDay));
    const currentWeek = dateToKey(startOfWeek(keyToDate(currentDay, zone), firstDay));
    if (previousWeek !== currentWeek && this._followingCurrentWeek) {
      this._anchorKey = currentWeek;
      if (this._selectedWeekKey && !this._weekIsDisplayed(this._selectedWeekKey)) {
        this._selectedWeekKey = null;
      }
    }
    void this._refresh();
  }

  private _onVisibilityChange(): void {
    if (typeof document === "undefined") return;
    if (document.visibilityState === "hidden") {
      // Pause polling while the page is hidden (§15).
      if (this._refreshTimer !== null) {
        window.clearInterval(this._refreshTimer);
        this._refreshTimer = null;
      }
      return;
    }
    this._nowMs = Date.now();
    this._ensureRefreshTimer();
    const force = this._lastRetrievedAt === null || Date.now() - this._lastRetrievedAt > STALE_AFTER_MS;
    void this._refresh({ force });
  }

  private _setConnection(connection: HassLike["connection"] | null): void {
    if (connection === this._connection) return;
    this._connection?.removeEventListener("ready", this._boundReconnect);
    this._connection = connection;
    // Refresh after reconnection (§15).
    this._connection?.addEventListener("ready", this._boundReconnect);
  }

  private _setupResizeObserver(): void {
    if (this._resizeObserver || typeof ResizeObserver === "undefined") return;
    this._resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect?.width ?? 0;
        if (entry.target === this) {
          if (width !== this._cardWidth) this._cardWidth = width;
        } else if (width !== this._calendarWidth) {
          this._calendarWidth = width;
        }
      }
    });
    this._resizeObserver.observe(this);
    const panel = this.renderRoot.querySelector(".cwc-calsurface");
    if (panel) {
      this._resizeObserver.observe(panel);
      this._observedCalendarEl = panel;
    }
  }

  // ------------------------------------------------------------------
  // Data retrieval (§12, §15)
  // ------------------------------------------------------------------

  private _displayZone(): string {
    return resolveDisplayTimezone(this._config?.timezone ?? "home_assistant", this.hass?.config?.time_zone);
  }

  private _formatContext(): FormatContext {
    return {
      zone: this._displayZone(),
      locale: this.hass?.locale?.language ?? this.hass?.language ?? "en",
      timeFormat: resolveTimeFormat(this._config?.time_format ?? "auto", this.hass?.locale?.time_format),
      nowMs: this._nowMs,
    };
  }

  private _anchorWeekStart(): DateTime {
    const config = this._config!;
    const zone = this._displayZone();
    const firstDay = config.calendar.first_day_of_week;
    const anchorKey =
      this._anchorKey ?? dateToKey(startOfWeek(DateTime.fromMillis(this._nowMs, { zone }), firstDay));
    return keyToDate(anchorKey, zone);
  }

  private _displayedWeeks(): DateTime[][] {
    const config = this._config!;
    const start = this._anchorWeekStart();
    const weeks: DateTime[][] = [];
    for (let w = 0; w < config.calendar.weeks_to_show; w += 1) {
      const rowStart = addCalendarDays(start, w * 7);
      const row: DateTime[] = [];
      for (let d = 0; d < 7; d += 1) row.push(addCalendarDays(rowStart, d));
      weeks.push(row);
    }
    return weeks;
  }

  private _calendarRange(): TimeRange | null {
    if (this._config?.view === "upcoming") return null;
    const start = this._anchorWeekStart();
    const end = addCalendarDays(start, this._config!.calendar.weeks_to_show * 7);
    return { startMs: start.toMillis(), endMs: end.toMillis() };
  }

  private _upcomingRange(): TimeRange | null {
    const config = this._config;
    if (!config || config.view === "calendar") return null;
    const zone = this._displayZone();
    if (this._followedWeekRange()) return null; // selected week replaces the horizon
    const start = this._nowMs;
    const end = DateTime.fromMillis(this._nowMs, { zone })
      .plus({ days: config.upcoming.lookahead_days })
      .toMillis();
    return { startMs: start, endMs: end };
  }

  private _followedWeekRange(): TimeRange | null {
    const config = this._config;
    if (!config || config.view === "calendar") return null;
    if (!config.upcoming.follow_selected_week || !this._selectedWeekKey) return null;
    const zone = this._displayZone();
    const start = keyToDate(this._selectedWeekKey, zone);
    return { startMs: start.toMillis(), endMs: addCalendarDays(start, 7).toMillis() };
  }

  private async _refresh(options: { force?: boolean } = {}): Promise<void> {
    const config = this._config;
    const hass = this.hass;
    if (!config || !hass) return;
    const generation = ++this._generation;
    const cache = getCacheForHass(hass);
    const needs = planRanges({
      calendar: this._calendarRange(),
      upcoming: this._upcomingRange(),
      selectedWeek: this._followedWeekRange(),
    });
    if (needs.length === 0) return;

    this._loading = true;
    this.requestUpdate();

    await Promise.all(
      config.sources.map(async (source) => {
        const results = await Promise.all(
          needs.map((range) =>
            cache.load(hass, source.entity, range, this._nowMs, { force: options.force ?? false })
          )
        );
        // Race protection (§15): a late response from an old configuration or
        // navigation must not overwrite newer state.
        if (generation !== this._generation) return;

        const events: CalendarEvent[] = [];
        const warnings: string[] = [];
        let failed = false;
        let lastRetrievedAt: number | null = null;
        for (const result of results) {
          const normalized = normalizeApiEvents(result.events, source, this._displayZone());
          events.push(...normalized.events);
          warnings.push(...normalized.warnings);
          if (result.status === "error" || result.status === "stale") {
            failed = true;
          }
          if (result.lastRetrievedAt !== null) {
            lastRetrievedAt = Math.max(lastRetrievedAt ?? 0, result.lastRetrievedAt);
          }
        }
        const deduped = dedupeWithinSource(events);
        this._eventsBySource.set(source.id, deduped);
        this._sourceStates.set(source.id, {
          sourceId: source.id,
          entity: source.entity,
          state: failed ? "error" : deduped.length > 0 ? "ready" : "empty",
          ...(failed
            ? { error: results.map((r) => r.error).filter(Boolean).join("; ") || "Request failed" }
            : {}),
          ...(lastRetrievedAt !== null ? { lastRetrievedAt } : {}),
          warnings,
        });
        if (lastRetrievedAt !== null) {
          this._lastRetrievedAt = Math.max(this._lastRetrievedAt ?? 0, lastRetrievedAt);
        }
      })
    );

    if (generation !== this._generation) return;
    this._loading = false;
    this._updateUnavailableSources();
    this.requestUpdate();
  }

  private _updateUnavailableSources(): void {
    // Mark configured entities that are missing/unavailable in hass.states as
    // runtime source errors — other sources keep working (§6).
    if (!this._config || !this.hass) return;
    for (const source of this._config.sources) {
      const stateObj = this.hass.states?.[source.entity];
      const unavailable =
        stateObj === undefined || stateObj.state === "unavailable" || stateObj.state === "unknown";
      const current = this._sourceStates.get(source.id);
      if (unavailable && current && current.state !== "error") {
        this._sourceStates.set(source.id, {
          ...current,
          state: "error",
          error: stateObj === undefined ? "Entity not found" : `Entity is ${stateObj.state}`,
        });
      }
    }
  }

  // ------------------------------------------------------------------
  // Actions
  // ------------------------------------------------------------------

  private _onPrevWeek(): void {
    this._navigate(-1);
  }

  private _onNextWeek(): void {
    this._navigate(1);
  }

  private _navigate(deltaWeeks: number): void {
    const anchor = this._anchorWeekStart();
    this._anchorKey = dateToKey(addCalendarDays(anchor, deltaWeeks * 7));
    this._followingCurrentWeek = false;
    this._clearWeekSelection();
    void this._refresh();
  }

  private _onToday(): void {
    const zone = this._displayZone();
    const firstDay = this._config!.calendar.first_day_of_week;
    this._anchorKey = dateToKey(startOfWeek(DateTime.fromMillis(this._nowMs, { zone }), firstDay));
    this._followingCurrentWeek = true;
    this._clearWeekSelection();
    void this._refresh();
  }

  private _clearWeekSelection(): void {
    this._selectedWeekKey = null;
    this._showAllSelectedWeek = false;
    void this._refresh();
  }

  private _onWeekSelect(weekStartKey: string): void {
    const config = this._config!;
    if (config.view === "calendar") {
      // Calendar-only mode can open a week-events dialog (§10).
      this._selectedWeekKey = weekStartKey;
      this._openWeekDialog(weekStartKey);
      return;
    }
    if (this._selectedWeekKey === weekStartKey) {
      // Selecting the selected week again clears the selection.
      this._clearWeekSelection();
      return;
    }
    this._selectedWeekKey = weekStartKey;
    this._showAllSelectedWeek = false;
    void this._refresh();
  }

  private _onEventOpen(event: CalendarEvent): void {
    const source = this._sourceViewInfos().get(event.sourceId);
    if (!source) return;
    this._dialogModel = { kind: "event", event, source };
  }

  private _onDayMore(dayKey: string): void {
    // "Tapping '+N more' opens every event for that date" (§7), including
    // multi-day occurrences overlapping the date (§13).
    const zone = this._displayZone();
    const events = this._allEvents().filter((event) => occursOnDay(event, dayKey, zone));
    this._dialogModel = {
      kind: "day",
      dayKey,
      events: sortForUpcoming(events, zone, this._sourceOrder()),
      sources: this._sourceViewInfos(),
    };
  }

  private _openWeekDialog(weekStartKey: string): void {
    const zone = this._displayZone();
    const start = keyToDate(weekStartKey, zone);
    const range = { startMs: start.toMillis(), endMs: addCalendarDays(start, 7).toMillis() };
    const events = this._allEvents().filter((event) => overlapsRange(event, range, zone));
    const fmt = this._formatContext();
    const startLabel = formatDate(dateToKey(start), fmt, true);
    const endLabel = formatDate(dateToKey(addCalendarDays(start, 6)), fmt, true);
    this._dialogModel = {
      kind: "week",
      weekLabel: `${startLabel} – ${endLabel}`,
      events: sortForUpcoming(events, zone, this._sourceOrder()),
      sources: this._sourceViewInfos(),
    };
  }

  private _onShowAll(): void {
    this._showAllSelectedWeek = true;
    this.requestUpdate();
  }

  private _onRefresh(): void {
    void this._refresh({ force: true });
  }

  // ------------------------------------------------------------------
  // Derived data for the views
  // ------------------------------------------------------------------

  private _allEvents(): CalendarEvent[] {
    const all: CalendarEvent[] = [];
    for (const source of this._config!.sources) {
      all.push(...(this._eventsBySource.get(source.id) ?? []));
    }
    return all;
  }

  private _sourceViewInfos(): Map<string, SourceViewInfo> {
    const map = new Map<string, SourceViewInfo>();
    for (const source of this._config!.sources) {
      map.set(source.id, this._sourceViewInfo(source));
    }
    return map;
  }

  private _sourceViewInfo(source: SourceConfig): SourceViewInfo {
    const stateObj = this.hass?.states?.[source.entity];
    const friendly =
      stateObj && this.hass?.formatEntityName
        ? this.hass.formatEntityName(stateObj)
        : (stateObj?.attributes?.friendly_name as string | undefined) ?? null;
    return {
      id: source.id,
      entity: source.entity,
      name: sourceDisplayName(source, friendly),
      color: source.color ?? paletteColorFor(source.id),
      icon: source.icon ?? "mdi:calendar",
    };
  }

  private _sourceOrder(): SourceOrder {
    return sourceOrderFrom(this._config!.sources);
  }

  private _weekIsDisplayed(weekStartKey: string): boolean {
    return this._displayedWeeks().some((week) => dateToKey(week[0]!) === weekStartKey);
  }

  private _sourceErrorNames(): string[] {
    const names: string[] = [];
    for (const source of this._config!.sources) {
      const status = this._sourceStates.get(source.id);
      if (status?.state === "error") {
        names.push(this._sourceViewInfo(source).name);
      }
    }
    return names;
  }

  private _calendarViewData(): CalendarViewData {
    const config = this._config!;
    const fmt = this._formatContext();
    const zone = fmt.zone;
    const order = this._sourceOrder();
    const all = this._allEvents();
    const weeks = this._displayedWeeks();
    const eventsOfDay = new Map<string, CalendarEvent[]>();
    for (const week of weeks) {
      for (const day of week) {
        const dayKey = dateToKey(day);
        eventsOfDay.set(dayKey, eventsForDay(all, dayKey, zone, order));
      }
    }
    const anchor = weeks[0]![0]!;
    const lastDay = weeks[weeks.length - 1]![6]!;
    const firstDay = config.calendar.first_day_of_week;
    const currentWeekKey = dateToKey(
      startOfWeek(DateTime.fromMillis(this._nowMs, { zone }), firstDay)
    );
    return {
      config,
      fmt,
      weeks,
      eventsOfDay,
      sources: this._sourceViewInfos(),
      todayKey: keyFromMillis(this._nowMs, zone),
      currentWeekKey: weeks.some((w) => dateToKey(w[0]!) === currentWeekKey) ? currentWeekKey : null,
      selectedWeekKey: this._selectedWeekKey,
      rangeLabel: rangeHeaderLabel(anchor, lastDay, fmt),
      layout: this._resolvedCalendarLayout(),
      gridForced: config.calendar.layout === "grid",
      sourceErrorNames: this._sourceErrorNames(),
    };
  }

  private _resolvedCalendarLayout(): "grid" | "agenda" {
    const config = this._config!;
    if (config.calendar.layout === "grid") return "grid";
    if (config.calendar.layout === "agenda") return "agenda";
    return this._calendarWidth >= GRID_MIN_CALENDAR_WIDTH ? "grid" : "agenda";
  }

  private _upcomingViewData(): UpcomingViewData {
    const config = this._config!;
    const fmt = this._formatContext();
    const zone = fmt.zone;
    const order = this._sourceOrder();
    const all = this._allEvents();
    const sources = this._sourceViewInfos();
    const ongoingIds = new Set<string>(
      all.filter((event) => isOngoing(event, this._nowMs, zone)).map((event) => event.id)
    );

    const followedRange = this._followedWeekRange();
    if (followedRange) {
      const limit = this._showAllSelectedWeek ? Number.MAX_SAFE_INTEGER : config.upcoming.max_events;
      const result = selectWeekEvents(all, order, {
        range: followedRange,
        zone,
        maxEvents: limit,
      });
      const startLabel = formatDate(dateToKey(keyToDate(this._selectedWeekKey!, zone)), fmt, true);
      const endLabel = formatDate(
        dateToKey(addCalendarDays(keyToDate(this._selectedWeekKey!, zone), 6)),
        fmt,
        true
      );
      const displayed = result.events.length;
      return {
        config,
        fmt,
        heading: `${startLabel} – ${endLabel}`,
        events: result.events,
        sources,
        ongoingIds,
        totalAvailable: result.total,
        emptyMessage: `No events in this week.`,
        showClearSelection: true,
        showAllLabel:
          !this._showAllSelectedWeek && result.total > displayed
            ? STRINGS.showAllEvents(result.total)
            : null,
        loading: this._loading,
        lastRetrievedAt: this._lastRetrievedAt,
      };
    }

    const result = selectUpcoming(all, order, {
      nowMs: this._nowMs,
      zone,
      maxEvents: config.upcoming.max_events,
      lookaheadDays: config.upcoming.lookahead_days,
      includeOngoing: config.upcoming.include_ongoing,
    });
    const horizonEnd = DateTime.fromMillis(this._nowMs, { zone })
      .plus({ days: config.upcoming.lookahead_days })
      .toMillis();
    const anyError = this._sourceErrorNames().length > 0;
    return {
      config,
      fmt,
      heading: STRINGS.upcomingTitle,
      events: result,
      sources,
      ongoingIds,
      totalAvailable: result.length,
      emptyMessage: anyError
        ? STRINGS.upcomingAllFailed
        : STRINGS.upcomingEmpty(formatDate(horizonEnd, fmt, true)),
      showClearSelection: false,
      showAllLabel: null,
      loading: this._loading,
      lastRetrievedAt: this._lastRetrievedAt,
    };
  }

  private _cardStatus(): CardStatus {
    const sources = [...this._sourceStates.values()];
    const anyError = sources.some((s) => s.state === "error");
    const allError = sources.length > 0 && sources.every((s) => s.state === "error");
    const events = this._allEvents();
    if (this._loading && events.length === 0) return "loading";
    if (allError && events.length === 0) return "error";
    if (anyError && events.length > 0) return "stale";
    if (events.length === 0) return "empty";
    return "ready";
  }

  // ------------------------------------------------------------------
  // Rendering
  // ------------------------------------------------------------------

  private get _calendarActions(): CalendarActions {
    return {
      onPrevWeek: () => this._onPrevWeek(),
      onNextWeek: () => this._onNextWeek(),
      onToday: () => this._onToday(),
      onWeekSelect: (key) => this._onWeekSelect(key),
      onEventOpen: (event) => this._onEventOpen(event),
      onDayMore: (dayKey) => this._onDayMore(dayKey),
    };
  }

  private get _upcomingActions(): UpcomingActions {
    return {
      onEventOpen: (event) => this._onEventOpen(event),
      onClearSelection: () => this._clearWeekSelection(),
      onShowAll: () => this._onShowAll(),
    };
  }

  override render(): TemplateResult {
    const config = this._config;
    if (!config || !this.hass) return html``;
    const fmt = this._formatContext();
    const status = this._cardStatus();
    const errorNames = this._sourceErrorNames();

    return html`
      <ha-card class="cwc-card">
        ${config.title
          ? html`<div class="cwc-card-head">
              <h1 class="cwc-card-title">${config.title}</h1>
              <div class="cwc-card-tools">
                ${this._lastRetrievedAt !== null
                  ? html`<span class="cwc-muted">${formatLastRetrieved(this._lastRetrievedAt, fmt)}</span>`
                  : nothing}
                <button
                  class="cwc-icon-button"
                  aria-label=${STRINGS.refresh}
                  title=${STRINGS.refresh}
                  @click=${this._onRefresh}
                >
                  ${ICON_REFRESH}
                </button>
              </div>
            </div>`
          : html`<div class="cwc-card-tools only-tools">
              ${this._lastRetrievedAt !== null
                ? html`<span class="cwc-muted">${formatLastRetrieved(this._lastRetrievedAt, fmt)}</span>`
                : nothing}
              <button
                class="cwc-icon-button"
                aria-label=${STRINGS.refresh}
                title=${STRINGS.refresh}
                @click=${this._onRefresh}
              >
                ${ICON_REFRESH}
              </button>
            </div>`}
        ${errorNames.length > 0
          ? html`<div class="cwc-banner" role="status">
              <span class="cwc-banner-icon">${ICON_WARNING}</span>
              <span>${STRINGS.sourceErrors(errorNames)}</span>
              <button class="cwc-text-button" @click=${this._onRefresh}>${STRINGS.retry}</button>
            </div>`
          : nothing}
        <div class="cwc-body">${this._renderBody()}</div>
        ${status === "loading" ? html`<div class="cwc-muted status-line">${STRINGS.loading}</div>` : nothing}
      </ha-card>
      <cwc-dialog
        .model=${this._dialogModel}
        .context=${{ config, fmt, ongoingIds: this._upcomingViewData().ongoingIds }}
        .onClosed=${() => (this._dialogModel = null)}
        .onEventOpen=${(event: CalendarEvent) => this._onEventOpen(event)}
      ></cwc-dialog>
    `;
  }

  private _renderBody(): TemplateResult {
    const config = this._config!;
    const showCalendar = config.view === "calendar" || config.view === "combined";
    const showUpcoming = config.view === "upcoming" || config.view === "combined";

    if (config.view !== "combined") {
      return html`
        ${showCalendar
          ? html`<div class="cwc-calsurface">${renderCalendarView(this._calendarViewData(), this._calendarActions)}</div>`
          : nothing}
        ${showUpcoming ? renderUpcomingList(this._upcomingViewData(), this._upcomingActions) : nothing}
      `;
    }

    const layout = config.combined_layout;
    const sideBySide = layout === "side_by_side" && this._cardWidth >= SIDE_BY_SIDE_MIN_CARD_WIDTH;
    const calendarFirst = layout !== "list_top";

    const calendar = showCalendar
      ? html`<div class="cwc-calsurface">${renderCalendarView(this._calendarViewData(), this._calendarActions)}</div>`
      : nothing;
    const upcoming = showUpcoming
      ? renderUpcomingList(this._upcomingViewData(), this._upcomingActions)
      : nothing;

    if (sideBySide) {
      return html`
        <div class="cwc-side-by-side">
          <div class="cwc-side-calendar">${calendar}</div>
          <div class="cwc-side-upcoming">${upcoming}</div>
        </div>
      `;
    }
    return html`
      <div class="cwc-stacked">${calendarFirst ? [calendar, upcoming] : [upcoming, calendar]}</div>
    `;
  }

  // ------------------------------------------------------------------
  // Sizing (§3)
  // ------------------------------------------------------------------

  getCardSize(): number {
    const weeks = this._config?.calendar.weeks_to_show ?? 4;
    return Math.min(3 + weeks * 3, 40);
  }

  getGridOptions(): { columns: number | "full"; rows: number | "auto"; min_rows: number } {
    return { columns: 12, rows: "auto", min_rows: 1 };
  }

  /** Static editor entry point (visual editor, §16). */
  static getConfigElement(): HTMLElement {
    // Imported lazily-safe: the editor class is registered in index.ts.
    return document.createElement("calendar-week-card-editor");
  }

  /** Static stub used by the card picker. */
  static getStubConfig(hass: HassLike, entities: string[]): Record<string, any> {
    const calendarEntities = (entities ?? []).filter((e) => e.startsWith("calendar."));
    const fallback = Object.keys(hass?.states ?? {}).find((e) => e.startsWith("calendar."));
    const entity = calendarEntities[0] ?? fallback ?? "calendar.calendar";
    return configToPlain(parseConfig({ sources: [{ id: generateSourceId([]), entity }] }));
  }

  static override styles = [
    sharedStyles,
    ...calendarViewStyles,
    ...upcomingStyles,
    css`
      ha-card {
        display: block;
        background: var(--ha-card-background, #ffffff);
        border-radius: var(--ha-card-border-radius, 12px);
        border: var(--ha-card-border-width, 1px) solid var(--ha-card-border-color, rgba(0, 0, 0, 0.12));
        box-shadow: var(--ha-card-box-shadow, none);
        padding: 12px 16px 16px;
      }

      .cwc-card-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        min-height: 48px;
      }

      .cwc-card-title {
        margin: 0;
        font-size: 17px;
        font-weight: 500;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .cwc-card-tools {
        display: flex;
        align-items: center;
        gap: 4px;
        flex: 0 0 auto;
      }

      .cwc-card-tools.only-tools {
        justify-content: flex-end;
        min-height: 48px;
      }

      .cwc-banner {
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 4px 0 8px;
        padding: 8px 10px;
        border-radius: 10px;
        background: color-mix(in srgb, var(--cwc-warning) 15%, transparent);
        color: var(--cwc-text);
        font-size: 13px;
      }

      .cwc-banner-icon svg {
        width: 18px;
        height: 18px;
        fill: var(--cwc-warning);
        vertical-align: -4px;
      }

      .cwc-banner .cwc-text-button {
        margin-left: auto;
      }

      .cwc-stacked {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .cwc-side-by-side {
        display: flex;
        align-items: flex-start;
        gap: 16px;
      }

      .cwc-side-calendar {
        flex: 0 0 60%;
        max-width: 60%;
        min-width: 0;
      }

      .cwc-side-upcoming {
        flex: 0 0 calc(40% - 16px);
        max-width: calc(40% - 16px);
        min-width: 0;
        border-left: 1px solid var(--cwc-divider);
        padding-left: 12px;
      }

      .status-line {
        padding-top: 8px;
      }
    `,
  ];
}

/** Whether an event's effective local date matches a day key (display tz). */
export { CwcDialog };

declare global {
  interface HTMLElementTagNameMap {
    "calendar-week-card": CalendarWeekCard;
    "cwc-dialog": CwcDialog;
  }
}
