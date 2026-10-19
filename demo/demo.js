/**
 * Fixture-based local preview. Loads the compiled bundle
 * (dist/calendar-week-card.js) against a mock Home Assistant API so the card
 * can be exercised exactly as it runs on a dashboard.
 */
import { MockHass } from "./mock-hass.js";

// The card wraps its content in <ha-card> like the built-in cards. The element
// is provided by Home Assistant; give the standalone preview a minimal shim.
if (!customElements.get("ha-card")) {
  customElements.define(
    "ha-card",
    class extends HTMLElement {
      connectedCallback() {
        this.style.display = "block";
      }
    }
  );
}

await import("../dist/calendar-week-card.js");

const CONFIG = {
  type: "custom:calendar-week-card",
  title: "Household Calendar",
  view: "combined",
  combined_layout: "calendar_top",
  timezone: "home_assistant",
  time_format: "auto",
  show_source_icons: true,
  show_source_names: false,
  show_location: true,
  show_end_time: true,
  calendar: {
    layout: "auto",
    weeks_to_show: 4,
    first_day_of_week: "monday",
    show_week_numbers: true,
    highlight_current_week: true,
    highlight_today: true,
    show_empty_days: true,
    max_events_per_day: 3,
  },
  upcoming: {
    max_events: 10,
    lookahead_days: 90,
    date_format: "relative",
    include_ongoing: true,
    follow_selected_week: false,
  },
  sources: [
    { id: "family", entity: "calendar.family", name: "Family", color: "#4CAF50", icon: "mdi:account-group" },
    { id: "work", entity: "calendar.work", name: "Work", color: "#2196F3", icon: "mdi:briefcase" },
    { id: "sports", entity: "calendar.sports", name: "Sports", color: "#FF9800", icon: "mdi:basketball" },
  ],
};

const hass = new MockHass();
let config = structuredClone(CONFIG);

const cardHost = document.getElementById("card-host");
const editorHost = document.getElementById("editor-host");
const configOut = document.getElementById("config-out");
const stage = document.getElementById("stage");

const card = document.createElement("calendar-week-card");
card.hass = hass;
card.setConfig(config);
cardHost.appendChild(card);

const editor = document.createElement("calendar-week-card-editor");
editor.hass = hass;
editor.setConfig(config);
editor.addEventListener("config-changed", (event) => {
  config = event.detail.config;
  card.setConfig(config);
  configOut.textContent = JSON.stringify(config, null, 2);
});
editorHost.appendChild(editor);
configOut.textContent = JSON.stringify(config, null, 2);

// ---------------------------------------------------------------------------
// Preview controls
// ---------------------------------------------------------------------------

document.getElementById("ctl-arrangement").addEventListener("change", (event) => {
  const [view, combinedLayout] = event.target.value.split(":");
  config = { ...config, view, combined_layout: combinedLayout };
  editor.setConfig(config);
  card.setConfig(config);
  configOut.textContent = JSON.stringify(config, null, 2);
});

document.getElementById("ctl-layout").addEventListener("change", (event) => {
  config = { ...config, calendar: { ...config.calendar, layout: event.target.value } };
  editor.setConfig(config);
  card.setConfig(config);
  configOut.textContent = JSON.stringify(config, null, 2);
});

function setWidth(width) {
  stage.style.width = width === "100%" ? "100%" : `${width}px`;
}
document.getElementById("w-375").addEventListener("click", () => setWidth(375));
document.getElementById("w-768").addEventListener("click", () => setWidth(768));
document.getElementById("w-1200").addEventListener("click", () => setWidth(1200));

document.getElementById("ctl-theme").addEventListener("change", (event) => {
  document.body.dataset.theme = event.target.value;
});

document.getElementById("ctl-fail-work").addEventListener("change", (event) => {
  hass.setFailing("calendar.work", event.target.checked);
  // Re-apply the configuration and use the card's manual refresh control so
  // the change is visible immediately (a plain re-request would be served
  // from the card's cache, which is exactly what the real card does too).
  card.setConfig(config);
  const refresh = card.shadowRoot?.querySelector('button[aria-label^="Reload events"]');
  if (refresh) {
    setTimeout(() => refresh.click(), 50);
  }
});

// Signal readiness for automation.
window.__demoReady = true;
