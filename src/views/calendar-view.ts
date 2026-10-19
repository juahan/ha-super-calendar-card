/**
 * Calendar section: the header (§7) plus the grid/agenda switch (§8).
 * View composition (combined layouts) is handled by the card itself, keeping
 * presentation separate from composition (§4).
 */
import { css, html, type TemplateResult } from "lit";
import { STRINGS } from "../strings";
import { renderAgenda, agendaStyles } from "./calendar-agenda";
import { renderGrid, gridStyles } from "./calendar-grid";
import { ICON_CHEVRON_LEFT, ICON_CHEVRON_RIGHT } from "./icons";
import type { CalendarActions, CalendarViewData } from "./view-types";

export const calendarViewStyles = [
  ...gridStyles,
  ...agendaStyles,
  css`
    .cal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      min-height: 48px;
      margin-bottom: 6px;
    }

    .cal-range {
      font-size: 15px;
      font-weight: 500;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .cal-controls {
      display: flex;
      align-items: center;
      gap: 2px;
      flex: 0 0 auto;
    }
  `,
];

export function renderCalendarView(
  data: CalendarViewData,
  actions: CalendarActions
): TemplateResult {
  return html`
    <div class="cal-section" role="group" aria-label="Calendar">
      <div class="cal-header">
        <div class="cal-range">${data.rangeLabel}</div>
        <div class="cal-controls">
          <button class="cwc-icon-button" aria-label=${STRINGS.previousWeek} @click=${actions.onPrevWeek}>
            ${ICON_CHEVRON_LEFT}
          </button>
          <button class="cwc-text-button" @click=${actions.onToday}>${STRINGS.todayButton}</button>
          <button class="cwc-icon-button" aria-label=${STRINGS.nextWeek} @click=${actions.onNextWeek}>
            ${ICON_CHEVRON_RIGHT}
          </button>
        </div>
      </div>
      ${data.layout === "grid" ? renderGrid(data, actions) : renderAgenda(data, actions)}
    </div>
  `;
}
