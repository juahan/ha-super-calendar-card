/**
 * Shared event-row templates and styles used by the grid, agenda, upcoming
 * list and dialogs. Presentation only; all data is prepared by the callers.
 */
import { css, html, nothing, type TemplateResult } from "lit";
import { displayTitle } from "../events";
import { formatFullRange, formatTime, type FormatContext } from "../dates";
import { STRINGS } from "../strings";
import type { CalendarEvent, CardConfig } from "../types";
import { ICON_ARROW_RIGHT, ICON_LOCATION, renderIcon } from "./icons";

export interface SourceViewInfo {
  id: string;
  name: string;
  color: string;
  icon: string;
  entity: string;
}

export interface EventRowOptions {
  config: CardConfig;
  fmt: FormatContext;
  source: SourceViewInfo;
  /** Display label already formatted (e.g. "Today · 18:30" or "18:30"). */
  label: string;
  ongoing: boolean;
  /** Whether the event spans multiple days (shows an arrow to its end). */
  multiDay: boolean;
  onOpen: (event: CalendarEvent) => void;
}

export const eventRowStyles = css`
  .cwc-row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    width: 100%;
    min-height: var(--cwc-row-height);
    padding: 6px 8px;
    border-radius: 8px;
    transition: background-color 0.15s ease;
  }

  .cwc-row:hover {
    background: var(--cwc-hover);
  }

  .cwc-row .bar {
    align-self: stretch;
    width: 4px;
    min-height: 20px;
    border-radius: 2px;
    background: var(--cwc-src, var(--cwc-accent));
    flex: 0 0 auto;
  }

  .cwc-row .body {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1 1 auto;
  }

  .cwc-row .line {
    display: flex;
    align-items: baseline;
    gap: 6px;
    min-width: 0;
    flex-wrap: wrap;
  }

  .cwc-row .time {
    color: var(--cwc-secondary);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .cwc-row .title {
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .cwc-row .meta {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    color: var(--cwc-secondary);
    font-size: 12px;
    min-width: 0;
  }

  .cwc-row .meta .txt {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
  }

  .cwc-row.all-day .time {
    font-style: italic;
  }

  .cwc-chip {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    min-height: var(--cwc-row-height);
    padding: 4px 6px;
    border-radius: 6px;
    border-left: 4px solid var(--cwc-src, var(--cwc-accent));
    background: var(--cwc-chip-bg, transparent);
    overflow: hidden;
  }

  .cwc-chip:hover {
    background: var(--cwc-hover);
  }

  .cwc-chip .time {
    color: var(--cwc-secondary);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .cwc-chip .title {
    font-size: 12.5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cwc-chip .title.all-day {
    font-style: italic;
  }

  .cwc-chip .meta-icons {
    display: flex;
    align-items: center;
    gap: 4px;
    color: var(--cwc-secondary);
    flex: 0 0 auto;
    margin-left: auto;
  }

  .cwc-source-tag {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    max-width: 140px;
  }

  .cwc-source-tag .txt {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cwc-row .meta svg,
  .cwc-chip .meta-icons svg {
    width: 14px;
    height: 14px;
    fill: currentColor;
    flex: 0 0 auto;
  }

  .cwc-row .meta .txt svg {
    vertical-align: -3px;
  }

  .cwc-end-time {
    white-space: nowrap;
    color: var(--cwc-secondary);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
`;

function sourceTag(options: EventRowOptions): TemplateResult | typeof nothing {
  const { config, source } = options;
  if (!config.show_source_icons && !config.show_source_names) return nothing;
  return html`<span class="cwc-source-tag" title=${source.name}>
    ${config.show_source_icons ? renderIcon(source.icon) : nothing}
    ${config.show_source_names
      ? html`<span class="txt">${source.name}</span>`
      : nothing}
    <span class="cwc-visually-hidden">${STRINGS.eventSource}: ${source.name}</span>
  </span>`;
}

function endLabelFromEvent(event: CalendarEvent, options: EventRowOptions): string | null {
  if (!options.config.show_end_time || event.allDay) return null;
  return formatTime(event.endMs, options.fmt);
}

/** Compact chip used inside grid day cells. `options.label` is the time label. */
export function renderEventChip(event: CalendarEvent, options: EventRowOptions): TemplateResult {
  const end = endLabelFromEvent(event, options);
  return html`
    <button
      class="cwc-chip"
      style=${`--cwc-src: ${options.source.color}`}
      @click=${() => options.onOpen(event)}
      aria-label=${`${options.label}, ${displayTitle(event)}, ${options.source.name}`}
    >
      <span class="time">${options.label}</span>
      <span class="title${event.allDay ? " all-day" : ""}">${displayTitle(event)}</span>
      ${options.ongoing
        ? html`<span class="cwc-badge cwc-badge-progress">${STRINGS.inProgress}</span>`
        : nothing}
      <span class="meta-icons">
        ${options.config.show_source_icons ? renderIcon(options.source.icon) : nothing}
        ${options.config.show_source_names
          ? html`<span class="cwc-end-time">${options.source.name}</span>`
          : nothing}
        ${options.config.show_location && event.location
          ? html`<span title=${event.location}>${ICON_LOCATION}</span>`
          : nothing}
        ${end ? html`<span class="cwc-end-time">– ${end}</span>` : nothing}
        ${options.multiDay ? html`<span title=${formatFullRange(event, options.fmt)}>${ICON_ARROW_RIGHT}</span>` : nothing}
      </span>
    </button>
  `;
}

/** Full row used in the agenda, upcoming list and dialogs. */
export function renderEventRow(event: CalendarEvent, options: EventRowOptions): TemplateResult {
  const end = endLabelFromEvent(event, options);
  return html`
    <button
      class="cwc-row${event.allDay ? " all-day" : ""}"
      style=${`--cwc-src: ${options.source.color}`}
      @click=${() => options.onOpen(event)}
      aria-label=${`${options.label}, ${displayTitle(event)}, ${options.source.name}${
        event.location && options.config.show_location ? `, ${event.location}` : ""
      }`}
    >
      <span class="bar"></span>
      <span class="body">
        <span class="line">
          <span class="time">${options.label}</span>
          <span class="title">${displayTitle(event)}</span>
          ${options.ongoing
            ? html`<span class="cwc-badge cwc-badge-progress">${STRINGS.inProgress}</span>`
            : nothing}
        </span>
        ${options.config.show_location && event.location
          ? html`<span class="meta">
              <span class="txt" title=${event.location}>${ICON_LOCATION} ${event.location}</span>
            </span>`
          : nothing}
        <span class="meta">
          ${sourceTag(options)}
          ${end ? html`<span class="cwc-end-time">– ${end}</span>` : nothing}
          ${options.multiDay
            ? html`<span class="txt">${formatFullRange(event, options.fmt)}</span>`
            : nothing}
        </span>
      </span>
    </button>
  `;
}
