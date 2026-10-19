/**
 * Calendar Week Card — bundle entry point.
 *
 * Registers the card element `calendar-week-card` (dashboard type
 * `custom:calendar-week-card`) and the visual editor
 * `calendar-week-card-editor`, and announces the card to Home Assistant's
 * card picker.
 */
import { CalendarWeekCard } from "./card";
import { CalendarWeekCardEditor } from "./editor";
import "./views/dialogs";

export { CalendarWeekCard, CalendarWeekCardEditor };
export * from "./types";
export {
  validateConfig,
  parseConfig,
  configToPlain,
  ConfigError,
  DEFAULT_CONFIG,
} from "./config";
export { normalizeApiEvents, selectUpcoming, selectWeekEvents } from "./events";
export { fetchCalendarEvents, testSourceConnection } from "./api";
export { getCacheForHass, ConnectionCache } from "./cache";

declare global {
  interface Window {
    customCards?: Array<{
      type: string;
      name: string;
      description?: string;
      preview?: boolean;
      documentationURL?: string;
    }>;
  }
}

if (!customElements.get("calendar-week-card")) {
  customElements.define("calendar-week-card", CalendarWeekCard);
}
if (!customElements.get("calendar-week-card-editor")) {
  customElements.define("calendar-week-card-editor", CalendarWeekCardEditor);
}

window.customCards = window.customCards || [];
if (!window.customCards.some((entry) => entry.type === "calendar-week-card")) {
  window.customCards.push({
    type: "calendar-week-card",
    name: "Calendar Week Card",
    description:
      "Multiweek calendar grid, responsive agenda and upcoming-events list for calendar entities (works with Remote Calendar).",
    preview: true,
    documentationURL: "https://github.com/juahan/ha-super-calendar-card",
  });
}
