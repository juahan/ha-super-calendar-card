/**
 * Modal dialog (§11, §16): event details, day "+N more" lists and week lists.
 *
 * Focus containment, Escape to close and focus restoration are implemented
 * here; text content is always rendered as plain text (never raw HTML).
 */
import { css, html, nothing, type TemplateResult } from "lit";
import { LitElement } from "lit";
import { property } from "lit/decorators.js";
import { formatFullRange, formatLongDate, type FormatContext } from "../dates";
import { upcomingRowLabel, isMultiDay } from "../formatting";
import { displayTitle } from "../events";
import { STRINGS } from "../strings";
import { sharedStyles } from "../styles";
import type { CalendarEvent, CardConfig } from "../types";
import { eventRowStyles, renderEventRow, type EventRowOptions, type SourceViewInfo } from "./event-parts";
import { ICON_CLOSE } from "./icons";

export type DialogModel =
  | { kind: "event"; event: CalendarEvent; source: SourceViewInfo }
  | {
      kind: "day";
      dayKey: string;
      events: CalendarEvent[];
      sources: Map<string, SourceViewInfo>;
    }
  | {
      kind: "week";
      weekLabel: string;
      events: CalendarEvent[];
      sources: Map<string, SourceViewInfo>;
    };

export interface DialogContext {
  config: CardConfig;
  fmt: FormatContext;
  ongoingIds: Set<string>;
}

const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export class CwcDialog extends LitElement {
  @property({ attribute: false }) model: DialogModel | null = null;
  @property({ attribute: false }) context: DialogContext | null = null;
  /** Called when the dialog closes (Escape, close button, backdrop). */
  @property({ attribute: false }) onClosed: () => void = () => {};
  /** Called when the user opens an event from a nested list. */
  @property({ attribute: false }) onEventOpen: (event: CalendarEvent) => void = () => {};

  private _wasOpen = false;
  private _lastFocused: HTMLElement | null = null;
  private _lastModel: DialogModel | null = null;

  protected override willUpdate(changed: Map<string, unknown>): void {
    if (changed.has("model")) {
      this.toggleAttribute("open", this.model !== null);
    }
  }

  override updated(): void {
    const isOpen = this.model !== null;
    const modelChanged = this.model !== this._lastModel;
    this._lastModel = this.model;
    if (isOpen && (!this._wasOpen || modelChanged)) {
      if (!this._wasOpen) {
        // The opener lives in the card's shadow tree; capture the focused
        // element of our own root node so focus can be restored precisely.
        let active: Element | null;
        try {
          active = (this.getRootNode() as Document | ShadowRoot).activeElement ?? null;
        } catch {
          active = null;
        }
        this._lastFocused = (active as HTMLElement) ?? null;
      }
      const root = this.shadowRoot;
      const title = root?.querySelector<HTMLElement>(".dialog-title");
      (title ?? root?.querySelector<HTMLElement>(".dialog"))?.focus();
    } else if (!isOpen && this._wasOpen) {
      this._lastFocused?.focus?.();
      this._lastFocused = null;
    }
    this._wasOpen = isOpen;
  }

  private _close(): void {
    this.model = null;
    this.onClosed();
  }

  private _onKeyDown(event: KeyboardEvent): void {
    if (!this.model) return;
    if (event.key === "Escape") {
      event.stopPropagation();
      event.preventDefault();
      this._close();
      return;
    }
    if (event.key !== "Tab") return;
    // Focus containment (§16).
    const focusables = [
      ...this.shadowRoot!.querySelectorAll<HTMLElement>(FOCUSABLE),
    ].filter((el) => el.offsetParent !== null || el === this.shadowRoot!.activeElement);
    if (focusables.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;
    const active = this.shadowRoot!.activeElement as HTMLElement | null;
    if (event.shiftKey && (active === first || active === null)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  private _rowOptions(source: SourceViewInfo, label: string, event: CalendarEvent): EventRowOptions {
    return {
      config: this.context!.config,
      fmt: this.context!.fmt,
      source,
      label,
      ongoing: this.context!.ongoingIds.has(event.id),
      multiDay: isMultiDay(event, this.context!.fmt),
      onOpen: this.onEventOpen,
    };
  }

  private _renderEvent(model: Extract<DialogModel, { kind: "event" }>): TemplateResult {
    const { fmt } = this.context!;
    const { event, source } = model;
    return html`
      <h2 class="dialog-title" tabindex="-1">${displayTitle(event)}</h2>
      <dl class="details">
        <dt>${STRINGS.eventSource}</dt>
        <dd>${source.name}</dd>
        <dt>${STRINGS.eventWhen}</dt>
        <dd>${formatFullRange(event, fmt)}</dd>
        ${event.location
          ? html`<dt>${STRINGS.eventWhere}</dt>
              <dd class="preserve">${event.location}</dd>`
          : nothing}
        ${event.description
          ? html`<dt>${STRINGS.eventWhat}</dt>
              <dd class="preserve">${event.description}</dd>`
          : nothing}
      </dl>
    `;
  }

  private _renderList(
    title: string,
    events: CalendarEvent[],
    sources: Map<string, SourceViewInfo>
  ): TemplateResult {
    const fmt = this.context!.fmt;
    return html`
      <h2 class="dialog-title" tabindex="-1">${title}</h2>
      <div class="dialog-list">
        ${events.map((event) => {
          const source = sources.get(event.sourceId);
          if (!source) return nothing;
          return renderEventRow(
            event,
            this._rowOptions(source, upcomingRowLabel(event, this.context!.config, fmt), event)
          );
        })}
        ${events.length === 0 ? html`<div class="cwc-empty">No events</div>` : nothing}
      </div>
    `;
  }

  override render(): TemplateResult {
    if (!this.model || !this.context) return html``;
    const content =
      this.model.kind === "event"
        ? this._renderEvent(this.model)
        : this.model.kind === "day"
          ? this._renderList(
              STRINGS.dayDialogHeading(formatLongDate(this.model.dayKey, this.context.fmt)),
              this.model.events,
              this.model.sources
            )
          : this._renderList(STRINGS.weekDialogHeading(this.model.weekLabel), this.model.events, this.model.sources);

    return html`
      <div class="backdrop" @click=${this._close}></div>
      <div
        class="dialog"
        role="dialog"
        aria-modal="true"
        aria-label=${this.model.kind === "event"
          ? displayTitle((this.model as Extract<DialogModel, { kind: "event" }>).event)
          : this.model.kind === "day"
            ? STRINGS.dayDialogHeading(formatLongDate(this.model.dayKey, this.context.fmt))
            : STRINGS.weekDialogHeading((this.model as Extract<DialogModel, { kind: "week" }>).weekLabel)}
        @keydown=${this._onKeyDown}
      >
        <div class="dialog-head">
          <button class="cwc-icon-button close" aria-label=${STRINGS.dialogClose} @click=${this._close}>
            ${ICON_CLOSE}
          </button>
        </div>
        ${content}
      </div>
    `;
  }

  static override styles = [
    sharedStyles,
    eventRowStyles,
    css`
      :host {
        position: fixed;
        inset: 0;
        z-index: 100;
        display: none;
      }

      :host([open]) {
        display: block;
      }

      .backdrop {
        position: absolute;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
      }

      .dialog {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: min(520px, calc(100vw - 32px));
        max-height: min(80vh, 640px);
        overflow-y: auto;
        background: var(--ha-card-background, #ffffff);
        color: var(--primary-text-color, #212121);
        border-radius: 16px;
        padding: 8px 20px 20px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      }

      .dialog:focus {
        outline: none;
      }

      .dialog-head {
        display: flex;
        justify-content: flex-end;
        min-height: 44px;
      }

      .dialog-title {
        margin: 0 0 12px;
        font-size: 20px;
        line-height: 1.3;
      }

      .dialog-title:focus {
        outline: none;
      }

      .details {
        display: grid;
        grid-template-columns: minmax(80px, auto) 1fr;
        gap: 8px 16px;
        margin: 0;
      }

      .details dt {
        color: var(--secondary-text-color, rgba(0, 0, 0, 0.6));
        font-size: 13px;
      }

      .details dd {
        margin: 0;
      }

      .details dd.preserve {
        white-space: pre-wrap;
      }

      .dialog-list {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
    `,
  ];
}

if (!customElements.get("cwc-dialog")) {
  customElements.define("cwc-dialog", CwcDialog);
}
