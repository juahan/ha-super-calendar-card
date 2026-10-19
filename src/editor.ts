/**
 * Visual editor (§16): exposes every configuration setting, manages sources
 * (add/remove/reorder, name/color/icon, connection test) and provides Remote
 * Calendar setup guidance.
 *
 * Emits complete `config-changed` events and never mutates the input object.
 */
import { css, html, nothing, type TemplateResult } from "lit";
import { LitElement } from "lit";
import { property, state } from "lit/decorators.js";
import {
  DEFAULT_CALENDAR_SECTION,
  DEFAULT_CONFIG,
  DEFAULT_UPCOMING_SECTION,
  configToPlain,
  generateSourceId,
  paletteColorFor,
  validateConfig,
} from "./config";
import { testSourceConnection } from "./api";
import { STRINGS } from "./strings";
import { sharedStyles } from "./styles";
import type {
  CardConfigInput,
  HassLike,
} from "./types";

type EditorSource = {
  id: string;
  entity: string;
  name?: string | null;
  color?: string | null;
  icon?: string | null;
  testResult?: string | null;
  testing?: boolean;
};

const VIEW_OPTIONS = ["calendar", "upcoming", "combined"] as const;
const COMBINED_LAYOUT_OPTIONS = ["calendar_top", "list_top", "side_by_side"] as const;
const CALENDAR_LAYOUT_OPTIONS = ["auto", "grid", "agenda"] as const;
const FIRST_DAY_OPTIONS = ["monday", "sunday"] as const;
const DATE_FORMAT_OPTIONS = ["relative", "absolute"] as const;
const TIME_FORMAT_OPTIONS = ["auto", "12", "24"] as const;

export class CalendarWeekCardEditor extends LitElement {
  @property({ attribute: false }) hass!: HassLike;
  /** Provided by Home Assistant; unused but part of the editor contract. */
  @property({ attribute: false }) lovelace?: unknown;

  @state() private _config: CardConfigInput = { type: "custom:calendar-week-card" };
  @state() private _errors: string[] = [];

  /** Receives the configuration. Never mutates the input object. */
  setConfig(config: CardConfigInput): void {
    this._config = JSON.parse(JSON.stringify(config ?? {}));
    this._validate();
  }

  // ------------------------------------------------------------------
  // Change handling
  // ------------------------------------------------------------------

  private _emit(): void {
    this._validate();
    // Emit a complete configuration (all settings materialized) while never
    // mutating the input object. When the current state is invalid — for
    // example while the user is still typing — the raw working copy is emitted
    // so nothing is silently dropped.
    const normalized = validateConfig(this._config).config;
    const output = normalized ? configToPlain(normalized) : this._config;
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config: output },
        bubbles: true,
        composed: true,
      })
    );
  }

  private _validate(): void {
    const result = validateConfig(this._config);
    this._errors = result.errors;
  }

  private _patch(patch: Partial<CardConfigInput>): void {
    this._config = { ...this._config, ...patch };
    this._emit();
  }

  private _patchCalendar(patch: Record<string, unknown>): void {
    this._config = {
      ...this._config,
      calendar: { ...(this._config.calendar ?? {}), ...patch },
    };
    this._emit();
  }

  private _patchUpcoming(patch: Record<string, unknown>): void {
    this._config = {
      ...this._config,
      upcoming: { ...(this._config.upcoming ?? {}), ...patch },
    };
    this._emit();
  }

  private _patchSource(index: number, patch: Partial<EditorSource>): void {
    const sources = (this._config.sources ?? []).map((s, i) =>
      i === index ? { ...s, ...patch } : s
    );
    this._config = { ...this._config, sources };
    this._emit();
  }

  private _addSource(): void {
    const existing = this._config.sources ?? [];
    const usedIds = existing.map((s) => s.id ?? "");
    const calendarEntities = this._calendarEntities();
    const usedEntities = new Set(existing.map((s) => s.entity));
    const entity =
      calendarEntities.find((e) => !usedEntities.has(e)) ?? calendarEntities[0] ?? "calendar.calendar";
    const source: EditorSource = {
      id: generateSourceId(usedIds),
      entity,
      name: "",
      color: null,
      icon: null,
    };
    this._config = { ...this._config, sources: [...existing, source] };
    this._emit();
  }

  private _removeSource(index: number): void {
    const sources = (this._config.sources ?? []).filter((_, i) => i !== index);
    this._config = { ...this._config, sources };
    this._emit();
  }

  private _moveSource(index: number, delta: number): void {
    const sources = [...(this._config.sources ?? [])];
    const target = index + delta;
    if (target < 0 || target >= sources.length) return;
    const [moved] = sources.splice(index, 1);
    sources.splice(target, 0, moved!);
    this._config = { ...this._config, sources };
    this._emit();
  }

  private _calendarEntities(): string[] {
    return Object.keys(this.hass?.states ?? {})
      .filter((entityId) => entityId.startsWith("calendar."))
      .sort();
  }

  private async _testSource(index: number): Promise<void> {
    const source = (this._config.sources ?? [])[index] as EditorSource | undefined;
    if (!source || !this.hass) return;
    this._patchSource(index, { testing: true, testResult: null });
    const result = await testSourceConnection(this.hass, source.entity, Date.now());
    const message = result.ok
      ? result.eventCount && result.eventCount > 0
        ? STRINGS.editor.testOk(result.eventCount)
        : STRINGS.editor.testOkEmpty
      : STRINGS.editor.testFailed(result.error ?? "unknown error");
    this._patchSource(index, { testing: false, testResult: message });
  }

  // ------------------------------------------------------------------
  // Field helpers
  // ------------------------------------------------------------------

  private _textField(
    label: string,
    value: string,
    onInput: (value: string) => void,
    helper?: string
  ): TemplateResult {
    return html`
      <label class="field">
        <span class="label">${label}</span>
        <input type="text" .value=${value} @input=${(e: Event) => onInput((e.target as HTMLInputElement).value)} />
        ${helper ? html`<span class="helper">${helper}</span>` : nothing}
      </label>
    `;
  }

  private _numberField(
    label: string,
    value: number,
    min: number,
    max: number,
    onInput: (value: number) => void
  ): TemplateResult {
    return html`
      <label class="field">
        <span class="label">${label}</span>
        <input
          type="number"
          min=${min}
          max=${max}
          step="1"
          .value=${String(value)}
          @change=${(e: Event) => {
            const raw = parseInt((e.target as HTMLInputElement).value, 10);
            if (Number.isInteger(raw)) onInput(Math.min(max, Math.max(min, raw)));
          }}
        />
      </label>
    `;
  }

  private _selectField(
    label: string,
    value: string,
    options: readonly string[],
    labels: (option: string) => string,
    onChange: (value: string) => void
  ): TemplateResult {
    return html`
      <label class="field">
        <span class="label">${label}</span>
        <select @change=${(e: Event) => onChange((e.target as HTMLSelectElement).value)}>
          ${options.map(
            (option) =>
              html`<option value=${option} ?selected=${option === value}>${labels(option)}</option>`
          )}
        </select>
      </label>
    `;
  }

  private _checkboxField(
    label: string,
    value: boolean,
    onChange: (value: boolean) => void
  ): TemplateResult {
    return html`
      <label class="field checkbox">
        <input
          type="checkbox"
          .checked=${value}
          @change=${(e: Event) => onChange((e.target as HTMLInputElement).checked)}
        />
        <span class="label">${label}</span>
      </label>
    `;
  }

  // ------------------------------------------------------------------
  // Sections
  // ------------------------------------------------------------------

  private _renderSources(): TemplateResult {
    const sources = (this._config.sources ?? []) as EditorSource[];
    const entities = this._calendarEntities();
    return html`
      <h3>${STRINGS.editor.sourcesSection}</h3>
      ${sources.map((source, index) => {
        const options = entities.includes(source.entity) || !source.entity
          ? entities
          : [source.entity, ...entities];
        return html`
          <div class="source-row">
            <div class="source-row-head">
              <span class="source-index">${index + 1}</span>
              <div class="source-move">
                <button
                  class="cwc-icon-button"
                  aria-label=${STRINGS.editor.moveUp}
                  ?disabled=${index === 0}
                  @click=${() => this._moveSource(index, -1)}
                >
                  ▲
                </button>
                <button
                  class="cwc-icon-button"
                  aria-label=${STRINGS.editor.moveDown}
                  ?disabled=${index === sources.length - 1}
                  @click=${() => this._moveSource(index, 1)}
                >
                  ▼
                </button>
                <button
                  class="cwc-icon-button"
                  aria-label=${STRINGS.editor.removeSource}
                  @click=${() => this._removeSource(index)}
                >
                  ✕
                </button>
              </div>
            </div>
            <label class="field">
              <span class="label">${STRINGS.editor.entityLabel}</span>
              <select
                @change=${(e: Event) =>
                  this._patchSource(index, { entity: (e.target as HTMLSelectElement).value })}
              >
                ${options.map(
                  (entity) =>
                    html`<option value=${entity} ?selected=${entity === source.entity}>${entity}</option>`
                )}
              </select>
            </label>
            <label class="field">
              <span class="label">${STRINGS.editor.sourceIdLabel}</span>
              <input type="text" .value=${source.id} disabled />
              <span class="helper">Stable id; preserved across renames and reordering.</span>
            </label>
            ${this._textField(STRINGS.editor.nameLabel, source.name ?? "", (value) =>
              this._patchSource(index, { name: value === "" ? null : value })
            )}
            <label class="field">
              <span class="label">${STRINGS.editor.colorLabel}</span>
              <div class="color-row">
                <input
                  type="color"
                  .value=${source.color ?? paletteColorFor(source.id)}
                  @input=${(e: Event) =>
                    this._patchSource(index, { color: (e.target as HTMLInputElement).value })}
                />
                <button
                  class="cwc-text-button"
                  @click=${() => this._patchSource(index, { color: source.color ? null : paletteColorFor(source.id) })}
                >
                  ${source.color ? "Use automatic color" : "Customize color"}
                </button>
              </div>
            </label>
            ${this._textField(
              STRINGS.editor.iconLabel,
              source.icon ?? "",
              (value) => this._patchSource(index, { icon: value === "" ? null : value }),
              "mdi:calendar by default"
            )}
            <div class="test-row">
              <button
                class="cwc-text-button"
                ?disabled=${source.testing === true}
                @click=${() => this._testSource(index)}
              >
                ${STRINGS.editor.testConnection}
              </button>
              ${source.testResult ? html`<span class="helper">${source.testResult}</span>` : nothing}
            </div>
          </div>
        `;
      })}
      <button class="cwc-button-filled" @click=${this._addSource}>${STRINGS.editor.addSource}</button>
      <p class="help">${STRINGS.editor.remoteCalendarHelp}</p>
    `;
  }

  override render(): TemplateResult {
    const config = this._config;
    const calendar = config.calendar ?? DEFAULT_CALENDAR_SECTION;
    const upcoming = config.upcoming ?? DEFAULT_UPCOMING_SECTION;
    return html`
      <div class="editor">
        <h2>${STRINGS.editor.title}</h2>

        <h3>${STRINGS.editor.viewSection}</h3>
        ${this._textField(STRINGS.editor.titleLabel, config.title ?? "", (value) =>
          this._patch({ title: value })
        )}
        ${this._selectField(
          STRINGS.editor.viewLabel,
          config.view ?? DEFAULT_CONFIG.view,
          VIEW_OPTIONS,
          (o) => o.replace("_", " "),
          (value) => this._patch({ view: value })
        )}
        ${(config.view ?? DEFAULT_CONFIG.view) === "combined"
          ? this._selectField(
              STRINGS.editor.combinedLayoutLabel,
              config.combined_layout ?? DEFAULT_CONFIG.combined_layout,
              COMBINED_LAYOUT_OPTIONS,
              (o) => o.replace("_", " "),
              (value) => this._patch({ combined_layout: value })
            )
          : nothing}

        <h3>${STRINGS.editor.displaySection}</h3>
        ${this._textField(
          STRINGS.editor.timezoneLabel,
          config.timezone ?? DEFAULT_CONFIG.timezone,
          (value) => this._patch({ timezone: value }),
          'Use "home_assistant" or a valid IANA timezone like "Europe/Helsinki".'
        )}
        ${this._selectField(
          STRINGS.editor.timeFormatLabel,
          config.time_format ?? DEFAULT_CONFIG.time_format,
          TIME_FORMAT_OPTIONS,
          (o) => (o === "auto" ? "auto (follow Home Assistant)" : `${o}-hour`),
          (value) => this._patch({ time_format: value })
        )}
        ${this._checkboxField(STRINGS.editor.showSourceIcons, config.show_source_icons ?? true, (v) =>
          this._patch({ show_source_icons: v })
        )}
        ${this._checkboxField(STRINGS.editor.showSourceNames, config.show_source_names ?? false, (v) =>
          this._patch({ show_source_names: v })
        )}
        ${this._checkboxField(STRINGS.editor.showLocation, config.show_location ?? false, (v) =>
          this._patch({ show_location: v })
        )}
        ${this._checkboxField(STRINGS.editor.showEndTime, config.show_end_time ?? false, (v) =>
          this._patch({ show_end_time: v })
        )}

        <h3>${STRINGS.editor.calendarSection}</h3>
        ${this._selectField(
          STRINGS.editor.calendarLayout,
          calendar.layout ?? DEFAULT_CALENDAR_SECTION.layout,
          CALENDAR_LAYOUT_OPTIONS,
          (o) => o,
          (value) => this._patchCalendar({ layout: value })
        )}
        ${this._numberField(STRINGS.editor.weeksToShow, calendar.weeks_to_show ?? 4, 1, 12, (v) =>
          this._patchCalendar({ weeks_to_show: v })
        )}
        ${this._selectField(
          STRINGS.editor.firstDayOfWeek,
          calendar.first_day_of_week ?? "monday",
          FIRST_DAY_OPTIONS,
          (o) => o,
          (value) => this._patchCalendar({ first_day_of_week: value })
        )}
        ${this._checkboxField(STRINGS.editor.showWeekNumbers, calendar.show_week_numbers ?? true, (v) =>
          this._patchCalendar({ show_week_numbers: v })
        )}
        ${this._checkboxField(
          STRINGS.editor.highlightCurrentWeek,
          calendar.highlight_current_week ?? true,
          (v) => this._patchCalendar({ highlight_current_week: v })
        )}
        ${this._checkboxField(STRINGS.editor.highlightToday, calendar.highlight_today ?? true, (v) =>
          this._patchCalendar({ highlight_today: v })
        )}
        ${this._checkboxField(STRINGS.editor.showEmptyDays, calendar.show_empty_days ?? true, (v) =>
          this._patchCalendar({ show_empty_days: v })
        )}
        ${this._numberField(STRINGS.editor.maxEventsPerDay, calendar.max_events_per_day ?? 3, 1, 20, (v) =>
          this._patchCalendar({ max_events_per_day: v })
        )}

        <h3>${STRINGS.editor.upcomingSection}</h3>
        ${this._numberField(STRINGS.editor.maxEvents, upcoming.max_events ?? 10, 1, 50, (v) =>
          this._patchUpcoming({ max_events: v })
        )}
        ${this._numberField(STRINGS.editor.lookaheadDays, upcoming.lookahead_days ?? 90, 1, 366, (v) =>
          this._patchUpcoming({ lookahead_days: v })
        )}
        ${this._selectField(
          STRINGS.editor.dateFormat,
          upcoming.date_format ?? "relative",
          DATE_FORMAT_OPTIONS,
          (o) => o,
          (value) => this._patchUpcoming({ date_format: value })
        )}
        ${this._checkboxField(STRINGS.editor.includeOngoing, upcoming.include_ongoing ?? true, (v) =>
          this._patchUpcoming({ include_ongoing: v })
        )}
        ${this._checkboxField(
          STRINGS.editor.followSelectedWeek,
          upcoming.follow_selected_week ?? false,
          (v) => this._patchUpcoming({ follow_selected_week: v })
        )}

        ${this._renderSources()}

        ${this._errors.length > 0
          ? html`<div class="errors" role="alert">
              ${this._errors.map((error) => html`<div>${error}</div>`)}
            </div>`
          : nothing}
      </div>
    `;
  }

  static override styles = [
    sharedStyles,
    css`
      :host {
        display: block;
      }

      .editor {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      h2 {
        margin: 4px 0 8px;
        font-size: 18px;
      }

      h3 {
        margin: 16px 0 4px;
        font-size: 14px;
        text-transform: uppercase;
        letter-spacing: 0.4px;
        color: var(--cwc-secondary);
      }

      .field {
        display: flex;
        flex-direction: column;
        gap: 4px;
        margin: 4px 0;
      }

      .field.checkbox {
        flex-direction: row;
        align-items: center;
        gap: 10px;
        min-height: var(--cwc-row-height);
      }

      .label {
        font-size: 13px;
        color: var(--cwc-secondary);
      }

      input[type="text"],
      input[type="number"],
      select {
        min-height: 40px;
        padding: 6px 10px;
        border: 1px solid var(--cwc-divider);
        border-radius: 8px;
        background: var(--cwc-surface);
        color: var(--cwc-text);
        font: inherit;
      }

      input[type="color"] {
        width: 48px;
        height: 40px;
        border: 1px solid var(--cwc-divider);
        border-radius: 8px;
        background: none;
        padding: 2px;
      }

      .color-row,
      .test-row,
      .source-move {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }

      .helper {
        font-size: 12px;
        color: var(--cwc-faint);
      }

      .help {
        font-size: 12.5px;
        color: var(--cwc-secondary);
        background: var(--cwc-surface-2);
        border-radius: 10px;
        padding: 10px 12px;
        line-height: 1.5;
      }

      .source-row {
        display: flex;
        flex-direction: column;
        gap: 4px;
        border: 1px solid var(--cwc-divider);
        border-radius: 12px;
        padding: 12px;
        margin: 8px 0;
      }

      .source-row-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .source-index {
        font-weight: 600;
      }

      .errors {
        margin-top: 12px;
        padding: 10px 12px;
        border-radius: 10px;
        background: color-mix(in srgb, var(--cwc-danger) 12%, transparent);
        color: var(--cwc-danger);
        font-size: 13px;
      }
    `,
  ];
}

if (!customElements.get("calendar-week-card-editor")) {
  customElements.define("calendar-week-card-editor", CalendarWeekCardEditor);
}

declare global {
  interface HTMLElementTagNameMap {
    "calendar-week-card-editor": CalendarWeekCardEditor;
  }
}
