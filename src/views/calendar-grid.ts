/**
 * Multiweek calendar grid (§7): one row per week, seven day columns and an
 * optional week-number column. The week-number column is never used as a
 * day-column heading.
 */
import { css, html, nothing, type TemplateResult } from "lit";
import type { DateTime } from "luxon";
import { dateToKey, formatLongDate, weekLabel, weekNumberForWeekStart } from "../dates";
import { eventTimeLabel, isMultiDay } from "../formatting";
import { STRINGS } from "../strings";
import { eventRowStyles, renderEventChip, type EventRowOptions } from "./event-parts";
import { ICON_CHECK } from "./icons";
import type { CalendarActions, CalendarViewData } from "./view-types";

export const gridStyles = [
  eventRowStyles,
  css`
  .grid-scroll {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  .grid {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 100%;
  }

  .grid.forced {
    min-width: calc(44px + 7 * 96px);
  }

  .grid-row {
    display: grid;
    grid-template-columns: minmax(44px, max-content) repeat(7, minmax(0, 1fr));
    gap: 2px;
  }

  .grid-head {
    color: var(--cwc-secondary);
    font-size: 12px;
    font-weight: 500;
    text-align: center;
    padding: 4px 0;
  }

  .grid-head.wk {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .week-row.selected .wk-btn {
    background: var(--cwc-accent);
    color: var(--cwc-accent-contrast);
  }

  .week-row.current .wk-btn {
    box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--cwc-accent) 55%, transparent);
  }

  .week-row.selected .day {
    background: color-mix(in srgb, var(--cwc-accent) 10%, transparent);
    border-radius: 8px;
  }

  .grid .wk-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1px;
    width: 100%;
    min-width: 44px;
    min-height: var(--cwc-row-height);
    border-radius: 10px;
    color: var(--cwc-secondary);
    font-size: 12px;
    font-weight: 600;
    background: var(--cwc-surface-2);
    text-align: center;
    padding: 2px;
  }

  .grid .wk-btn:hover {
    background: var(--cwc-hover);
    color: var(--cwc-text);
  }

  .grid .wk-btn .check {
    width: 12px;
    height: 12px;
  }

  .grid .wk-btn .check svg {
    width: 12px;
    height: 12px;
    fill: currentColor;
  }

  .day {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-height: 56px;
    padding: 2px;
    border-radius: 8px;
  }

  .day-head {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 24px;
    font-size: 12px;
    color: var(--cwc-secondary);
  }

  .day-num {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 24px;
    height: 24px;
    border-radius: 12px;
    font-weight: 500;
    color: var(--cwc-text);
  }

  .day.today .day-num {
    background: var(--cwc-accent);
    color: var(--cwc-accent-contrast);
    font-weight: 700;
  }

  .day-events {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .more-btn {
    align-self: flex-start;
    min-height: var(--cwc-row-height);
    padding: 0 8px;
    color: var(--cwc-accent);
    font-size: 12px;
    font-weight: 500;
    border-radius: 8px;
    white-space: nowrap;
  }

  .more-btn:hover {
    background: var(--cwc-hover);
  }
`,
];

function weekSelectButton(
  weekStart: DateTime,
  data: CalendarViewData,
  actions: CalendarActions
): TemplateResult {
  const { first_day_of_week: firstDay, show_week_numbers: showWeekNumbers } = data.config.calendar;
  const { weekNumber, weekYear } = weekNumberForWeekStart(weekStart, firstDay);
  const label = weekLabel(weekStart, data.fmt, true);
  const startKey = dateToKey(weekStart);
  const selected = data.selectedWeekKey === startKey;
  const visibleText = showWeekNumbers ? String(weekNumber) : label;
  const ariaLabel = selected
    ? STRINGS.weekSelected(`${STRINGS.weekNumber(weekNumber, weekYear)}, ${label}`)
    : STRINGS.selectWeek(`${STRINGS.weekNumber(weekNumber, weekYear)}, ${label}`);
  return html`
    <button
      class="wk-btn"
      aria-label=${ariaLabel}
      aria-pressed=${selected ? "true" : "false"}
      @click=${() => actions.onWeekSelect(startKey)}
    >
      <span>${visibleText}</span>
      ${selected ? html`<span class="check" aria-hidden="true">${ICON_CHECK}</span>` : nothing}
    </button>
  `;
}

function dayCell(
  day: DateTime,
  data: CalendarViewData,
  actions: CalendarActions
): TemplateResult {
  const dayKey = dateToKey(day);
  const all = data.eventsOfDay.get(dayKey) ?? [];
  const limit = data.config.calendar.max_events_per_day;
  const shown = all.slice(0, limit);
  const hidden = all.length - shown.length;
  const isToday = dayKey === data.todayKey;
  const classes = ["day"];
  if (isToday && data.config.calendar.highlight_today) classes.push("today");

  return html`
    <div
      class=${classes.join(" ")}
      role="gridcell"
      aria-label=${formatLongDate(dayKey, data.fmt)}
    >
      <div class="day-head">
        <span class="day-num" aria-current=${isToday ? "date" : "false"}>${day.day}</span>
      </div>
      <div class="day-events">
        ${shown.map((event) => {
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
          return renderEventChip(event, options);
        })}
        ${hidden > 0
          ? html`<button
              class="more-btn"
              @click=${() => actions.onDayMore(dayKey)}
              aria-label=${STRINGS.moreEventsLabel(hidden, formatLongDate(dayKey, data.fmt))}
            >
              +${hidden} more
            </button>`
          : nothing}
      </div>
    </div>
  `;
}

export function renderGrid(data: CalendarViewData, actions: CalendarActions): TemplateResult {
  const firstWeek = data.weeks[0];
  const weekdayHeaders = firstWeek
    ? firstWeek.map((day) => day.setLocale(data.fmt.locale).toLocaleString({ weekday: "short" }))
    : [];

  return html`
    <div class="grid-scroll">
      <div class="grid${data.gridForced ? " forced" : ""}" role="grid">
        <div class="grid-row" role="row">
          <div class="grid-head wk" role="columnheader">
            <span aria-hidden="true">Wk</span>
            <span class="cwc-visually-hidden">Week number</span>
          </div>
          ${weekdayHeaders.map(
            (name) => html`<div class="grid-head" role="columnheader">${name}</div>`
          )}
        </div>
        ${data.weeks.map((week) => {
          const startKey = dateToKey(week[0]!);
          const isCurrent = data.currentWeekKey === startKey;
          const isSelected = data.selectedWeekKey === startKey;
          const classes = ["grid-row", "week-row"];
          if (isCurrent && data.config.calendar.highlight_current_week) classes.push("current");
          if (isSelected) classes.push("selected");
          return html`
            <div class=${classes.join(" ")} role="row">
              <div class="wk-cell" role="rowheader">
                ${weekSelectButton(week[0]!, data, actions)}
              </div>
              ${week.map((day) => dayCell(day, data, actions))}
            </div>
          `;
        })}
      </div>
    </div>
    ${data.sourceErrorNames.length > 0
      ? html`<div class="cwc-muted" style="padding: 6px 4px 0;">
          ${STRINGS.calendarUnavailable}
        </div>`
      : nothing}
  `;
}
