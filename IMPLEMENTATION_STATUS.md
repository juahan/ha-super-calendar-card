# Implementation status — Calendar Week Card

Spec: `docs/spec.md` ("HA Calendar Week — Implementation Specification v2.0").
Last updated: 2026-10-19.

## Repository naming note (one spec deviation, additive only)

The spec fixes `Repository: calendar-week-card` and
`Bundle: dist/calendar-week-card.js`. The actual GitHub repository is
`ha-super-calendar-card`. **The spec's identifiers are unchanged**:
`custom:calendar-week-card`, `calendar-week-card`,
`dist/calendar-week-card.js`. For HACS repository-name matching, the build
also writes a byte-identical `dist/ha-super-calendar-card.js` alias
(`scripts/postbuild.mjs`). Both resource URLs are documented in the README.

## Completed requirements

### Architecture (§2, §3)
- [x] One frontend-only HACS card; no Python, no ICS fetching/parsing, no
      recurrence expansion, no proxy, no credentials, no external service.
- [x] TypeScript (strict), Lit, Luxon, Rollup, Vitest, Playwright, ESLint,
      committed lockfile, Node 22 LTS recorded (`.nvmrc`, `engines`).
- [x] Identifiers: `calendar-week-card`, `calendar-week-card-editor`,
      `custom:calendar-week-card`, `dist/calendar-week-card.js`.
- [x] Single ES module bundle; Lit + Luxon compiled in; no CDNs, no code
      splitting, no external fonts. Inline SVG icons + `ha-icon` when present.

### Views (§4)
- [x] All five arrangements; view composition (`_renderBody`) separate from
      calendar presentation (`views/calendar-view.ts` grid/agenda).
- [x] Side-by-side 60/40, stacking below 1100 px card width; `ResizeObserver`
      on card and calendar panel (not viewport width).
- [x] Upcoming horizon independent of the displayed calendar range.

### Configuration (§5, §6)
- [x] Exact contract and defaults as specified (verified by unit tests).
- [x] `sources` required/nonempty; `calendar.*` only; unique source ids and
      entity ids; six-digit hex colors; deterministic palette; `mdi:calendar`
      default icon; friendly-name fallback chain.
- [x] Actionable `ConfigError`; nested sections optional; input never mutated
      (deep-frozen input test).

### Calendar (§7, §8)
- [x] Week rows × 7 day columns + optional week-number column (never used as
      day headings); header with range, prev/today/next.
- [x] All-day before timed; time+title; optional icon/name/location/end time;
      "+N more" opens every event of the date.
- [x] Independent current-week and today highlighting; distinct selected-week
      indicator (filled button + check glyph + aria-pressed).
- [x] ISO week numbers with the Thursday rule (Sunday-first rows), ISO
      week-year in accessible labels.
- [x] Auto grid/agenda at 840 px panel width; forced grid scrolls horizontally;
      agenda covers identical dates; `show_empty_days: false` hides empty
      agenda days but preserves all grid columns; failing sources prevent
      "definitely empty" labelling.

### Upcoming list (§9)
- [x] Defaults: 10 events, 90-day horizon at same local time, ongoing
      included, completed excluded, multi-day once, never past the horizon.
- [x] Ongoing definitions per spec (timed `start <= now < end`; all-day date
      range in display timezone).
- [x] `include_ongoing: false` semantics (keeps today's all-day events).
- [x] Sort: effective start (local midnight for all-day), source order, title,
      stable id; all-day events do not jump ahead of earlier timed events.
- [x] Horizon-based empty state; heading count = events actually displayed.

### Week selection (§10)
- [x] Keyboard-accessible selection (week number or week label), works in
      agenda too; toggling off supported.
- [x] `follow_selected_week: false` → highlight only (week dialog in
      calendar-only mode).
- [x] `follow_selected_week: true` → week-overlap filtering including
      completed events, week-range heading, `max_events` applied,
      "Show all N events", "Clear week selection".
- [x] Navigation (prev/next/today) clears selection; state never written to
      YAML.

### Event details and formatting (§11)
- [x] Dialog: full title, source name, absolute range, location, description;
      "Untitled event." fallback; plain text only (XSS test included).
- [x] Relative label table (Today/Tomorrow/weekday/date · time or "All day"),
      "In progress" indicator; absolute mode with conditional year; 12/24-hour
      via `time_format`/user preference.

### Retrieval (§12)
- [x] `hass.callApi("GET", "calendars/{entity}?start=…&end=…")` following
      frontend path conventions; no user token; `calendar.*` only.
- [x] Range planning from active views (calendar weeks / now→horizon / selected
      week), overlapping intervals merged, disjoint requested separately,
      hidden views not retrieved.
- [x] Per-source requests; API results treated as expanded occurrences.

### Normalization (§13)
- [x] Exact `CalendarEvent` union; date-only preserved; UTC ms for timed;
      start-inclusive/end-exclusive; midnight-ending events; multi-day display
      rules; zero-duration handling; malformed events skipped with warnings;
      dedupe within source only; UID-based or deterministic identity.

### Timezone and clock (§14)
- [x] Display timezone (`home_assistant` → `hass.config.time_zone`, never the
      browser zone); calendar arithmetic; minute-level indicator updates;
      date-dependent labels recomputed at local midnight; auto-advance at week
      boundary only when following the current week.

### Refresh, caching, source status (§15)
- [x] 5-minute polling while visible; refresh on reconnection
      (`connection` "ready"), new ranges, returning to a stale page, manual
      control (no `homeassistant.update_entity`, no ICS-freshness claims).
- [x] Memory-only cache scoped per connection+entity+range, coalescing, LRU
      bound (50), stale retention after failures, race protection (fetch
      generation in the card + cache-level guards), shared across card
      instances.
- [x] Status model loading/ready/empty/stale/error; "Last retrieved" wording.

### Editor and accessibility (§16)
- [x] All settings exposed; view/arrangement selectors; calendar and upcoming
      settings; calendar-only entity selector; source name/color/icon;
      add/remove/reorder with generated ids preserved across rename/reorder;
      connection test via the same adapter (empty result valid); Remote
      Calendar guidance.
- [x] Complete `config-changed` events (defaults materialized when valid),
      input never mutated, hidden-view settings preserved.
- [x] Accessible labels, visible focus, 44 px touch targets for controls and
      event rows, keyboard navigation, dialog focus containment/Escape/focus
      restoration, source identity beyond color (icon/name + color bar),
      light/dark support, reduced-motion support.

### Packaging and documentation (§17, §18)
- [x] `src/`, `tests/`, `demo/`, `dist/calendar-week-card.js` (committed),
      `hacs.json`, `package.json`, `package-lock.json`, `README.md`, `LICENSE`,
      `CHANGELOG.md`, `IMPLEMENTATION_STATUS.md`, `.github/workflows/`
      (CI + tagged release attaching the bundle).
- [x] README covers all 12 required topics, incl. the 15-minute Remote
      Calendar automation example and the card-retrieval vs feed-refresh
      distinction.
- [x] Fixture-based local preview (`demo/`) and actual screenshots
      (`screenshots/`, regenerated via `npm run screenshots`).

### Tests (§19)
- [x] 142 Vitest unit tests: config validation/defaults/round-tripping, date
      logic (DST Europe/Helsinki both transitions, ISO week-year boundaries,
      Sunday/Monday starts, browser-vs-display timezone), normalization
      (date-only, exclusive ends, zero-duration, multi-day, overnight,
      midnight-ending, malformed), sorting, upcoming horizon/limits/ongoing,
      week filtering, range planning, cache (coalescing, TTL, stale retention,
      LRU bound, sharing), card component behavior (all five arrangements,
      grid/agenda thresholds, navigation, auto-advance, week selection +
      filtering + clearing, dialogs, partial failures, races, cleanup), editor
      round-tripping.
- [x] 26 Playwright tests against the compiled bundle in the fixture preview:
      arrangements, responsiveness at 375/768/1200, navigation, week selection
      and filtering, dialogs (content, Escape, focus containment/restore),
      relative labels, source failures, editor→card round-trip, light/dark.

## Commands run and results (2026-10-19)

| Command | Result |
| --- | --- |
| `npm install` (creates `package-lock.json`) | OK — 165 packages |
| `npm run lint` | PASS — 0 problems |
| `npm run typecheck` | PASS — 0 errors |
| `npm run test` | PASS — 142/142 tests, 7 files |
| `npm run test:e2e` | PASS — 26/26 tests (Playwright Chromium, fixture preview) |
| `npm run build` | PASS — `dist/calendar-week-card.js` + alias, single ES module, no external imports, no dev-mode warnings |
| `npm run screenshots` | PASS — 12 screenshots regenerated and visually reviewed (mobile/tablet/desktop × light/dark, grid/agenda/arrangements/dialog/editor/source-error) |

Playwright note: the host OS is not officially supported by Playwright; the
Chromium fallback build for ubuntu24.04 was used and all browser tests pass.

## Outstanding work / unverified manual acceptance checks

These require a real Home Assistant instance and are **unverified** here —
mocked tests are not proof of them (spec §19):

- [ ] **Real HA installation**: add the card to a live dashboard, verify
      `custom:calendar-week-card` renders with multiple Remote Calendar feeds.
- [ ] **HACS custom-repository installation and one update cycle** (verify the
      registered resource URL HACS produces; both candidate URLs are
      documented in the README).
- [ ] **Representative feeds checked against sources**: recurring events,
      all-day events, timezone-sensitive events vs. their upstream calendars.
- [ ] Visual check in a real HA theme (both default themes were checked in the
      fixture preview only) and on a real phone/tablet.
- [ ] Card sizing in HA's sections and masonry views (`getCardSize`/
      `getGridOptions` implemented per docs, not verified on a live dashboard).
- [ ] `ha-icon` rendering of `mdi:*` source icons inside HA (fixture preview
      uses a letter-glyph fallback since `ha-icon` is not available there).

Not done by design (spec forbids): publishing releases, deploying, or
submitting to the HACS catalog. The release workflow is ready but has not been
triggered; it needs an explicit `v*` tag push and authorization.

## Continuation instructions

1. `npm ci` (Node 22, see `.nvmrc`).
2. Verify everything still passes: `npm run lint && npm run typecheck && npm run test && npm run test:e2e && npm run build`.
3. If source changed, refresh artifacts: `npm run build` (also refreshes the
   `ha-super-calendar-card.js` alias) and `npm run screenshots`.
4. Manual verification steps are listed above; record results here, then the
   README's "Supported and tested Home Assistant versions" can be updated with
   actually tested HA versions.
5. Do not publish/tag/release without explicit authorization from the
   repository owner.

## File map

```text
src/
  index.ts        registration (customElements, window.customCards)
  card.ts         card element: composition, data flow, timers, navigation
  config.ts       validation + defaults (pure)
  dates.ts        date arithmetic + formatting (pure)
  events.ts       normalization, sorting, selection (pure)
  formatting.ts   event label formatting (pure)
  ranges.ts       range planning/merging (pure)
  api.ts          hass.callApi adapter + connection test
  cache.ts        per-connection memory cache
  editor.ts       visual editor
  styles.ts       shared theme-aware styles
  strings.ts      UI strings
  views/          grid, agenda, upcoming list, dialogs, icons, row templates
tests/            Vitest unit + component tests
e2e/              Playwright tests (run against demo/)
demo/             fixture preview (mock hass, fixtures, page, static server)
scripts/          dev runner, screenshot capture, post-build alias
screenshots/      generated preview screenshots (referenced by README)
dist/             compiled bundles (committed for HACS)
```
