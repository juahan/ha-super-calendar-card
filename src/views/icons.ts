/** Inline SVG icons (no external fonts or icon dependencies at runtime). */
import { html, svg, type TemplateResult } from "lit";

export const ICON_CHEVRON_LEFT = svg`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>`;
export const ICON_CHEVRON_RIGHT = svg`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>`;
export const ICON_REFRESH = svg`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.65 6.35A7.958 7.958 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>`;
export const ICON_CLOSE = svg`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`;
export const ICON_CALENDAR = svg`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 3h-1V1h-2v2H8V1H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm0 16H5V9h14v10zM5 7V5h14v2H5z"/></svg>`;
export const ICON_LOCATION = svg`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>`;
export const ICON_CHECK = svg`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`;
export const ICON_WARNING = svg`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>`;
export const ICON_ARROW_RIGHT = svg`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/></svg>`;

/**
 * Render a configured icon name (e.g. `mdi:account-group`).
 *
 * Inside Home Assistant the frontend's `ha-icon` renders Material Design
 * Icons. In the standalone fixture preview `ha-icon` is not available, so a
 * neutral inline glyph is used as a fallback.
 */
export function renderIcon(name: string | null, fallbackLabel = ""): TemplateResult {
  if (name && customElements.get("ha-icon")) {
    return html`<ha-icon class="cwc-inline-icon" .icon=${name} aria-hidden="true"></ha-icon>`;
  }
  if (name && name.startsWith("mdi:")) {
    return html`<svg class="cwc-inline-icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="currentColor"></circle>
      <text
        x="12"
        y="16.5"
        text-anchor="middle"
        font-size="12"
        font-weight="700"
        fill="var(--ha-card-background, #ffffff)"
      >
        ${name.slice(4, 5).toUpperCase()}
      </text>
    </svg>`;
  }
  void fallbackLabel;
  return html`${ICON_CALENDAR}`;
}
