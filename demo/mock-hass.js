/**
 * A minimal Home Assistant `hass` mock for the fixture preview and Playwright
 * tests. It serves the same authenticated calendar API shape as the real
 * `GET /api/calendars/{entity_id}?start=…&end=…` endpoint and supports
 * simulated source failures and latency.
 */
import { buildFixtures, helsinkiMidnight } from "./fixtures.js";

export class MockHass {
  constructor(options = {}) {
    this.fixtures = options.fixtures ?? buildFixtures();
    this.timeZone = options.timeZone ?? "Europe/Helsinki";
    this.latencyMs = options.latencyMs ?? 120;
    this.failing = new Set(options.failing ?? []);
    this.requestLog = [];
    this.states = {
      "calendar.family": {
        entity_id: "calendar.family",
        state: "on",
        attributes: { friendly_name: "Family calendar" },
      },
      "calendar.work": {
        entity_id: "calendar.work",
        state: "on",
        attributes: { friendly_name: "Work calendar" },
      },
      "calendar.sports": {
        entity_id: "calendar.sports",
        state: "on",
        attributes: { friendly_name: "Sports club" },
      },
    };
    this.config = { time_zone: this.timeZone, location_name: "Demo Home" };
    this.language = "en";
    this.locale = { language: "en-US", time_format: "24" };
    this.connection = {
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    this.formatEntityName = (stateObj) => stateObj?.attributes?.friendly_name ?? stateObj?.entity_id;
  }

  setFailing(entityId, fail) {
    if (fail) this.failing.add(entityId);
    else this.failing.delete(entityId);
    document.dispatchEvent(new CustomEvent("demo-hass-updated"));
  }

  async callApi(method, path) {
    if (method !== "GET") throw new Error(`Unsupported method ${method}`);
    this.requestLog.push(path);
    const match = /^calendars\/([^?]+)\?start=([^&]+)&end=(.+)$/.exec(path);
    if (!match) throw new Error(`Unexpected path ${path}`);
    const entityId = decodeURIComponent(match[1]);
    const start = Date.parse(decodeURIComponent(match[2]));
    const end = Date.parse(decodeURIComponent(match[3]));
    if (this.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
    }
    if (this.failing.has(entityId)) {
      throw new Error(`Could not fetch events for ${entityId} (simulated failure)`);
    }
    const events = this.fixtures[entityId] ?? [];
    return events.filter((event) => this.#overlaps(event, start, end));
  }

  #overlaps(event, startMs, endMs) {
    let eventStart;
    let eventEnd;
    if (event.start.date) {
      eventStart = Date.parse(helsinkiMidnight(event.start.date));
      eventEnd = Date.parse(helsinkiMidnight(event.end.date));
    } else {
      eventStart = Date.parse(event.start.dateTime);
      eventEnd = Date.parse(event.end.dateTime);
    }
    return eventStart < endMs && Math.max(eventEnd, eventStart + 1) > startMs;
  }
}
