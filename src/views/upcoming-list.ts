/**
 * Upcoming-events list (§9, §10) — standalone or below/above/beside the
 * calendar. The upcoming horizon stays independent from the displayed calendar
 * range (§4).
 */
import { css, html, nothing, type TemplateResult } from "lit";
import { upcomingRowLabel, isMultiDay } from "../formatting";
import { STRINGS } from "../strings";
import { eventRowStyles, renderEventRow, type EventRowOptions } from "./event-parts";
import type { UpcomingActions, UpcomingViewData } from "./view-types";

export const upcomingStyles = [
  eventRowStyles,
  css`
    .up-head {
      display: flex;
      align-items: center;
      gap: 8px;
      min-height: 48px;
      margin-bottom: 4px;
    }

    .up-title {
      font-size: 15px;
      font-weight: 500;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .up-count {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 24px;
      height: 24px;
      padding: 0 8px;
      border-radius: 12px;
      background: var(--cwc-surface-2);
      color: var(--cwc-secondary);
      font-size: 12px;
      font-weight: 600;
    }

    .up-actions {
      display: flex;
      align-items: center;
      gap: 2px;
      margin-left: auto;
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    .up-list {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .up-footer {
      display: flex;
      flex-direction: column;
      gap: 2px;
      margin-top: 6px;
    }

    .up-upcoming-note {
      padding: 6px 8px;
      color: var(--cwc-faint);
      font-size: 12px;
    }
  `,
];

export function renderUpcomingList(
  data: UpcomingViewData,
  actions: UpcomingActions
): TemplateResult {
  return html`
    <div class="up-section" role="group" aria-label=${data.heading}>
      <div class="up-head">
        <div class="up-title">${data.heading}</div>
        <span class="up-count" aria-label=${`${data.events.length} events displayed`}
          >${data.events.length}</span
        >
        <div class="up-actions">
          ${data.showAllLabel
            ? html`<button class="cwc-text-button" @click=${actions.onShowAll}>
                ${data.showAllLabel}
              </button>`
            : nothing}
          ${data.showClearSelection
            ? html`<button class="cwc-text-button" @click=${actions.onClearSelection}>
                ${STRINGS.clearWeekSelection}
              </button>`
            : nothing}
        </div>
      </div>
      ${data.events.length === 0
        ? html`<div class="cwc-empty">${data.emptyMessage}</div>`
        : html`<div class="up-list">
            ${data.events.map((event) => {
              const source = data.sources.get(event.sourceId);
              if (!source) return nothing;
              const options: EventRowOptions = {
                config: data.config,
                fmt: data.fmt,
                source,
                label: upcomingRowLabel(event, data.config, data.fmt),
                ongoing: data.ongoingIds.has(event.id),
                multiDay: isMultiDay(event, data.fmt),
                onOpen: actions.onEventOpen,
              };
              return renderEventRow(event, options);
            })}
          </div>`}
      ${data.loading
        ? html`<div class="up-upcoming-note">${STRINGS.loading}</div>`
        : nothing}
    </div>
  `;
}
