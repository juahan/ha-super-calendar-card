/**
 * Responsive calendar agenda (§8): vertical agenda grouped by week and day,
 * covering exactly the same date range as the grid.
 */
import { css, html, nothing, type TemplateResult } from "lit";
import type { DateTime } from "luxon";
import { dateToKey, formatDayLabel, formatLongDate, weekLabel, weekNumberForWeekStart } from "../dates";
import { eventTimeLabel, isMultiDay } from "../formatting";
import { STRINGS } from "../strings";
import {
  eventRowStyles,
  renderEventRow,
  type EventRowOptions,
} from "./event-parts";
import { ICON_CHECK } from "./icons";
import type { CalendarActions, CalendarViewData } from "./view-types";

export const agendaStyles = [
  eventRowStyles,
  css`
  .agenda {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .agenda-week {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .agenda-week-head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 2px 0 4px;
    border-bottom: 1px solid var(--cwc-divider);
    position: sticky;
    top: 0;
    background: var(--cwc-surface);
    z-index: 1;
  }

  .agenda-week-head .wk-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    width: auto;
    max-width: 100%;
    min-height: var(--cwc-row-height);
    padding: 0 10px;
    border-radius: 10px;
    font-weight: 600;
    color: var(--cwc-secondary);
    white-space: nowrap;
  }

  .agenda-week-head .wk-btn:hover {
    background: var(--cwc-hover);
    color: var(--cwc-text);
  }

  .agenda-week-head.selected .wk-btn {
    background: var(--cwc-accent);
    color: var(--cwc-accent-contrast);
  }

  .agenda-week-head .wk-btn svg {
    width: 14px;
    height: 14px;
    fill: currentColor;
  }

  .agenda-day {
    display: flex;
    gap: 10px;
    padding: 6px 2px;
    border-radius: 8px;
    min-height: var(--cwc-row-height);
  }

  .agenda-day.today {
    background: color-mix(in srgb, var(--cwc-accent) 10%, transparent);
  }

  .agenda-day .day-label {
    flex: 0 0 108px;
    font-size: 13px;
    color: var(--cwc-secondary);
    padding-top: 10px;
    font-variant-numeric: tabular-nums;
  }

  .agenda-day.today .day-label {
    color: var(--cwc-text);
    font-weight: 600;
  }

  .agenda-day .day-events {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1 1 auto;
    min-width: 0;
  }

  .agenda-day .empty {
    padding: 10px 8px;
    color: var(--cwc-faint);
    font-size: 13px;
  }

  .agenda-day .uncertain {
    padding: 10px 8px;
    color: var(--cwc-secondary);
    font-size: 13px;
    font-style: italic;
  }

  .agenda-day .more-btn {
    align-self: flex-start;
    min-height: var(--cwc-row-height);
    padding: 0 8px;
    color: var(--cwc-accent);
    font-size: 12.5px;
    font-weight: 500;
    border-radius: 8px;
  }
`,
];

function agendaWeekButton(
  weekStart: DateTime,
  data: CalendarViewData,
  actions: CalendarActions
): TemplateResult {
  const { first_day_of_week: firstDay, show_week_numbers: showWeekNumbers } = data.config.calendar;
  const { weekNumber, weekYear } = weekNumberForWeekStart(weekStart, firstDay);
  const label = weekLabel(weekStart, data.fmt, true);
  const startKey = dateToKey(weekStart);
  const selected = data.selectedWeekKey === startKey;
  const text = showWeekNumbers
    ? `${STRINGS.weekNumber(weekNumber, weekYear)} · ${label}`
    : label;
  const ariaLabel = selected
    ? STRINGS.weekSelected(text)
    : STRINGS.selectWeek(text);
  return html`
    <button
      class="wk-btn"
      aria-label=${ariaLabel}
      aria-pressed=${selected ? "true" : "false"}
      @click=${() => actions.onWeekSelect(startKey)}
    >
      <span>${text}</span>
      ${selected ? html`<span aria-hidden="true">${ICON_CHECK}</span>` : nothing}
    </button>
  `;
}

export function renderAgenda(data: CalendarViewData, actions: CalendarActions): TemplateResult {
  const hasErrors = data.sourceErrorNames.length > 0;
  return html`
    <div class="agenda">
      ${data.weeks.map((week) => {
        const startKey = dateToKey(week[0]!);
        const isSelected = data.selectedWeekKey === startKey;
        return html`
          <section class="agenda-week">
            <div class="agenda-week-head${isSelected ? " selected" : ""}">
              ${agendaWeekButton(week[0]!, data, actions)}
            </div>
            ${week.map((day) => {
              const dayKey = dateToKey(day);
              const events = data.eventsOfDay.get(dayKey) ?? [];
              const isToday = dayKey === data.todayKey;
              const empty = events.length === 0;
              // A failed request must not make days look definitively empty (§8):
              // keep such days visible and say so instead of hiding/emptying them.
              if (empty && !data.config.calendar.show_empty_days && !hasErrors) {
                return nothing;
              }
              return html`
                <div class="agenda-day${isToday ? " today" : ""}">
                  <div class="day-label">
                    <div>${formatDayLabel(dayKey, data.fmt)}</div>
                    <div>${formatLongDate(dayKey, data.fmt)}</div>
                  </div>
                  <div class="day-events">
                    ${events.map((event) => {
                      const source = data.sources.get(event.sourceId);
                      if (!source) return nothing;
                      const options: EventRowOptions = {
                        config: data.config,
                        fmt: data.fmt,
                        source,
                        label: eventTimeLabel(event, data.fmt),
                        ongoing: false,
                        multiDay: isMultiDay(event, data.fmt),
                        onOpen: actions.onEventOpen,
                      };
                      return renderEventRow(event, options);
                    })}
                    ${empty
                      ? hasErrors
                        ? html`<div class="uncertain">${STRINGS.calendarUnavailable}</div>`
                        : html`<div class="empty">No events</div>`
                      : nothing}
                  </div>
                </div>
              `;
            })}
          </section>
        `;
      })}
    </div>
  `;
}
