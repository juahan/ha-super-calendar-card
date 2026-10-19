# Changelog

All notable changes to Calendar Week Card are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project adheres to [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-10-19

### Added

- Multiweek calendar grid with ISO week numbers (Thursday rule for
  Sunday-first rows), week-number/label selection buttons, current-week and
  today highlighting, per-day event limits with a "+N more" dialog.
- Responsive calendar agenda grouped by week and day (grid ≥ 840 px panel
  width in `auto` layout), with `show_empty_days` handling that never marks
  days empty while a source request is failing.
- Upcoming-events list with relative (`Today · 18:30`) and absolute date
  formats, ongoing/completed handling, configurable horizon
  (`lookahead_days`) independent of the displayed calendar range.
- Five view arrangements: `calendar`, `upcoming`, and `combined` with
  `calendar_top`, `list_top`, `side_by_side` (60/40, stacking below 1100 px
  card width).
- Week selection with optional list filtering
  (`upcoming.follow_selected_week`), "Show all N events" and
  "Clear week selection" controls, transient state that never modifies YAML.
- Event dialogs with title, source, full absolute range, location and
  description (plain text only), Escape/close-button dismissal, focus
  containment and focus restoration.
- Visual editor exposing every setting, calendar-entity selectors, source
  add/remove/reorder with stable generated ids, connection tests through the
  same API adapter, and Remote Calendar setup guidance.
- Home Assistant calendar API retrieval through `hass.callApi`, per-connection
  memory cache (≤ 50 entries, request coalescing, stale retention, race
  protection, shared between card instances), 5-minute polling while visible,
  manual refresh control labelled "Last retrieved" (never "Last ICS sync").
- Timezone-correct date handling (display timezone from Home Assistant unless
  overridden), DST-safe calendar arithmetic, exclusive all-day end dates,
  zero-duration events, multi-day occurrence display, deterministic source
  palette colors.
- Fixture-based local preview, Vitest unit tests (142) and Playwright browser
  tests (26), screenshots, HACS metadata, CI and tagged-release workflows.

[1.0.0]: https://github.com/juahan/ha-super-calendar-card/releases/tag/v1.0.0
