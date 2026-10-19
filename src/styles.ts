/**
 * Shared styles. Theme-aware via Home Assistant CSS variables with explicit
 * fallbacks so the fixture preview works standalone. Supports light/dark and
 * prefers-reduced-motion (§16).
 */
import { css } from "lit";

export const sharedStyles = css`
  :host {
    display: block;
    --cwc-text: var(--primary-text-color, #212121);
    --cwc-secondary: var(--secondary-text-color, rgba(0, 0, 0, 0.6));
    --cwc-faint: var(--secondary-text-color, rgba(0, 0, 0, 0.45));
    --cwc-accent: var(--primary-color, #03a9f4);
    --cwc-accent-contrast: var(--text-primary-color, #ffffff);
    --cwc-divider: var(--divider-color, rgba(0, 0, 0, 0.12));
    --cwc-surface: var(--ha-card-background, #ffffff);
    --cwc-surface-2: var(--ha-card-background, rgba(0, 0, 0, 0.04));
    --cwc-hover: rgba(0, 0, 0, 0.06);
    --cwc-danger: var(--error-color, #db4437);
    --cwc-warning: var(--warning-color, #ff9800);
    --cwc-radius: var(--ha-card-border-radius, 12px);
    --cwc-row-height: 44px;
    color: var(--cwc-text);
    font-family: var(--paper-font-body1_-_font-family, Roboto, Noto, sans-serif);
    font-size: 14px;
    line-height: 1.35;
    -webkit-font-smoothing: antialiased;
  }

  button {
    font: inherit;
    color: inherit;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    margin: 0;
    text-align: inherit;
    border-radius: 8px;
    -webkit-tap-highlight-color: transparent;
  }

  button:focus-visible,
  [tabindex]:focus-visible,
  select:focus-visible,
  input:focus-visible,
  textarea:focus-visible {
    outline: 2px solid var(--cwc-accent);
    outline-offset: 2px;
  }

  .cwc-icon-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: var(--cwc-row-height);
    min-height: var(--cwc-row-height);
    border-radius: 50%;
    color: var(--cwc-secondary);
    transition: background-color 0.15s ease;
  }

  .cwc-icon-button:hover {
    background: var(--cwc-hover);
    color: var(--cwc-text);
  }

  .cwc-icon-button svg {
    width: 20px;
    height: 20px;
    fill: currentColor;
  }

  .cwc-text-button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: var(--cwc-row-height);
    padding: 0 12px;
    border-radius: 22px;
    color: var(--cwc-accent);
    font-weight: 500;
  }

  .cwc-text-button:hover {
    background: var(--cwc-hover);
  }

  .cwc-button-filled {
    background: var(--cwc-accent);
    color: var(--cwc-accent-contrast);
    border-radius: 20px;
    padding: 0 16px;
    min-height: 40px;
    font-weight: 500;
  }

  .cwc-button-filled:hover {
    filter: brightness(1.05);
  }

  .cwc-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    font-weight: 500;
    padding: 2px 8px;
    border-radius: 10px;
    background: var(--cwc-hover);
    color: var(--cwc-secondary);
    white-space: nowrap;
  }

  .cwc-badge-progress {
    background: color-mix(in srgb, var(--cwc-accent) 15%, transparent);
    color: var(--cwc-accent);
  }

  .cwc-chip-source {
    width: 10px;
    height: 10px;
    border-radius: 3px;
    flex: 0 0 auto;
  }

  .cwc-inline-icon {
    width: 16px;
    height: 16px;
    flex: 0 0 auto;
    vertical-align: -3px;
  }

  .cwc-warning-text {
    color: var(--cwc-danger);
    font-size: 13px;
  }

  .cwc-muted {
    color: var(--cwc-secondary);
    font-size: 12px;
  }

  .cwc-empty {
    padding: 20px 12px;
    text-align: center;
    color: var(--cwc-secondary);
  }

  .cwc-visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  @media (prefers-reduced-motion: reduce) {
    * {
      transition: none !important;
      animation: none !important;
      scroll-behavior: auto !important;
    }
  }
`;
