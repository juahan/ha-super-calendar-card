This version uses **Home Assistant’s Remote Calendar integration for ICS feeds**. The deliverable is one HACS dashboard card, with no custom backend or browser-side ICS parser.

**HA Calendar Week — Implementation Specification v2.0**

**1. Product objective**

Build a compact, attractive Home Assistant dashboard card that combines multiple calendar entities into:

- A multiweek calendar grid.
- A chronological list of upcoming events.
- Both views together, stacked or side by side.

Users configure ICS feeds through Home Assistant’s built-in Remote Calendar integration, then select the resulting `calendar.*` entities in the card. Other Home Assistant calendar integrations must also work.

The card is read-only. It does not download ICS files, manage calendar credentials, or create or edit events.

**2. Installation and architecture**

Deliver one frontend-only custom card distributed through HACS.

```text
ICS feeds
    ↓
Home Assistant Remote Calendar integration
    ↓
calendar.* entities and calendar API
    ↓
Calendar Week Card
```

Remote Calendar handles feed downloads, parsing, recurrence, and source timezone interpretation. The card retrieves event occurrences and handles display, aggregation, filtering, and navigation.

Remote Calendar is built into Home Assistant and is configured separately. Its default feed polling interval is 24 hours; faster polling requires the documented Home Assistant automation setup. Card refreshes must not be described as refreshing the original ICS feed. [Remote Calendar documentation](https://www.home-assistant.io/integrations/remote_calendar/).

Do not implement:

- A Python integration or external service.
- Direct ICS URL configuration or fetching.
- An ICS parser or recurrence engine.
- Calendar credentials or account authentication.
- Event creation, editing, or deletion.

**3. Technology and identifiers**

Use:

- TypeScript with strict checking.
- Lit for the card and visual editor.
- Luxon for timezone-aware date arithmetic.
- Rollup for the production bundle.
- Vitest for unit tests.
- Playwright for browser tests.
- ESLint and a committed package lockfile.
- A supported Node.js LTS release, recorded in the repository.

Use these names consistently:

```text
Repository: calendar-week-card
Card element: calendar-week-card
Editor element: calendar-week-card-editor
Dashboard type: custom:calendar-week-card
Bundle: dist/calendar-week-card.js
```

Bundle all runtime dependencies into one JavaScript ES module. Do not use CDNs, runtime code splitting, or external fonts.

Implement Home Assistant’s card registration, configuration, editor, and sizing interfaces according to the [custom-card documentation](https://contributors.home-assistant.io/frontend/custom-ui/card/).

**4. Supported view arrangements**

Provide five arrangements through two independent settings:

| `view` | `combined_layout` | Result |
|---|---|---|
| `calendar` | Ignored | Calendar only |
| `upcoming` | Ignored | Upcoming-events list only |
| `combined` | `calendar_top` | Calendar above list |
| `combined` | `list_top` | List above calendar |
| `combined` | `side_by_side` | Calendar left, list right |

Defaults:

```yaml
view: combined
combined_layout: calendar_top
```

In side-by-side mode, use approximately 60% width for the calendar and 40% for the list. Below 1100 CSS pixels of card width, stack the calendar above the list.

Measure the card and calendar panel with `ResizeObserver`. Do not base responsiveness solely on browser viewport width.

**5. Configuration contract**

```yaml
type: custom:calendar-week-card
title: Household Calendar

view: combined
combined_layout: calendar_top

timezone: home_assistant
time_format: auto

show_source_icons: true
show_source_names: false
show_location: false
show_end_time: false

calendar:
  layout: auto
  weeks_to_show: 4
  first_day_of_week: monday
  show_week_numbers: true
  highlight_current_week: true
  highlight_today: true
  show_empty_days: true
  max_events_per_day: 3

upcoming:
  max_events: 10
  lookahead_days: 90
  date_format: relative
  include_ongoing: true
  follow_selected_week: false

sources:
  - id: family
    entity: calendar.family
    name: Family
    color: "#4CAF50"
    icon: mdi:account-group

  - id: work
    entity: calendar.work
    name: Work
    color: "#2196F3"
    icon: mdi:briefcase

  - id: sports
    entity: calendar.sports
    name: Sports
    color: "#FF9800"
    icon: mdi:basketball
```

The `sources` list contains only Home Assistant entities. Do not accept URLs.

**6. Configuration validation and defaults**

| Setting | Allowed values | Default |
|---|---|---|
| `title` | String; empty hides title | `Calendar` |
| `view` | `calendar`, `upcoming`, `combined` | `combined` |
| `combined_layout` | `calendar_top`, `list_top`, `side_by_side` | `calendar_top` |
| `timezone` | `home_assistant` or valid IANA timezone | `home_assistant` |
| `time_format` | Strings `auto`, `12`, `24` | `auto` |
| `show_source_icons` | Boolean | `true` |
| `show_source_names` | Boolean | `false` |
| `show_location` | Boolean | `false` |
| `show_end_time` | Boolean | `false` |
| `calendar.layout` | `auto`, `grid`, `agenda` | `auto` |
| `calendar.weeks_to_show` | Integer 1–12 | `4` |
| `calendar.first_day_of_week` | `monday`, `sunday` | `monday` |
| `calendar.show_week_numbers` | Boolean | `true` |
| `calendar.highlight_current_week` | Boolean | `true` |
| `calendar.highlight_today` | Boolean | `true` |
| `calendar.show_empty_days` | Boolean | `true` |
| `calendar.max_events_per_day` | Integer 1–20 | `3` |
| `upcoming.max_events` | Integer 1–50 | `10` |
| `upcoming.lookahead_days` | Integer 1–366 | `90` |
| `upcoming.date_format` | `relative`, `absolute` | `relative` |
| `upcoming.include_ongoing` | Boolean | `true` |
| `upcoming.follow_selected_week` | Boolean | `false` |

`sources` is required and must be nonempty.

Each source requires:

- A unique, stable string `id`.
- An entity ID beginning with `calendar.`.

Optional source fields:

- `name`: defaults to the entity’s friendly name, then entity ID.
- `color`: six-digit hexadecimal color; otherwise assign a deterministic palette color.
- `icon`: defaults to `mdi:calendar`.

Reject duplicate entity IDs within one card.

Invalid configuration produces an actionable configuration error. Missing or unavailable entities are runtime source errors and must not prevent other sources from working.

Nested sections may be omitted; apply defaults without mutating the supplied configuration.

**7. Multiweek calendar**

The grid has **one row per week, seven day columns, and an optional week-number column**. Each cell represents a date. Week numbers must not be used as day-column headings.

Initially display the current week followed by subsequent weeks.

The calendar header contains:

- Displayed date range.
- Previous week.
- Today.
- Next week.

Previous and next shift the displayed range by one week. Today returns to the current week.

Each day shows:

- Date.
- Today styling when applicable.
- All-day events before timed events.
- Event time and title.
- Optional source icon, source name, location, and end time.
- A “+N more” button when the daily event limit is exceeded.

Tapping “+N more” opens every event for that date.

Highlight the current week and today independently. A selected week must have a distinct selection indicator.

Week numbers use ISO numbering. For Sunday-first rows, determine the ISO week number from the Thursday within that row. Include the ISO week-year in accessible labels where necessary.

**8. Responsive calendar agenda**

With `calendar.layout: auto`:

- Use the grid when the calendar panel is at least 840 CSS pixels wide.
- Otherwise display a vertical agenda grouped by week and day.

The agenda covers exactly the same date range as the grid.

With `layout: grid`, preserve readable day-column widths and allow horizontal scrolling in narrow containers.

With `layout: agenda`, always use the vertical agenda.

When `show_empty_days: false`, hide empty days in the agenda. Preserve all seven columns in the grid so dates remain aligned; omit empty-state text there.

A failed request must not cause affected dates to be labelled definitively empty.

**9. Upcoming-events list**

Aggregate occurrences from all selected calendars.

Default behavior:

- Show the next 10 events.
- Search from now until the same local time 90 calendar days ahead.
- Include ongoing events.
- Exclude completed events.
- Show each multi-day occurrence once.
- Never search beyond the configured horizon to fill the list.

Ongoing means:

- Timed event: `start <= now < end`.
- All-day event: today is within its start-inclusive, end-exclusive date range.

With `include_ongoing: false`, omit timed events that have started and all-day events whose start date precedes today. Keep today’s all-day events.

Sort by:

1. Effective start instant, using local midnight for all-day events.
2. Source order.
3. Title.
4. Stable event ID.

Do not place every future all-day event ahead of earlier timed events.

If fewer than N events exist, show the available events. If none exist, show an explicit horizon-based empty state.

The heading count represents events actually displayed, not the configured maximum.

**10. Week selection and list synchronization**

Each week has a keyboard-accessible selection button: the week number when visible, otherwise its week/date-range label.

Selection must also work in agenda layout.

With `follow_selected_week: false`:

- Selecting a week highlights it.
- The upcoming list remains unchanged.
- Calendar-only mode can open a week-events dialog.

With `follow_selected_week: true` in combined mode:

- Selecting a week filters the list to occurrences overlapping that week.
- Include completed events in the selected week.
- Change the heading to the selected week’s date range.
- Apply `upcoming.max_events`.
- Provide “Show all N events” if the week has additional events.
- Provide “Clear week selection” to restore normal upcoming behavior.

Calendar navigation clears week selection. Today also clears it.

Week selection is transient card state and must not modify YAML.

**11. Event details and date formatting**

Tapping an event opens a dialog containing:

- Full title.
- Source name.
- Full absolute date/time range.
- Location.
- Description.

Missing titles display as “Untitled event.”

Render descriptions and locations as plain text. Never insert calendar content as raw HTML.

Relative formatting:

| Event date | Label |
|---|---|
| Today | `Today · 18:30` |
| Tomorrow | `Tomorrow · 09:00` |
| Two through six calendar days ahead | Weekday and time |
| Other dates | Localized date and time |

Replace time with “All day” for all-day events. Add an “In progress” indicator for ongoing events. Relative formatting is based on calendar dates in the display timezone.

In absolute mode, show localized dates and times. Include the year when it differs from the current year.

Initial interface text is English. Date and time formatting follows Home Assistant user preferences unless explicitly overridden.

**12. Event retrieval**

Use the authenticated Home Assistant calendar API through the supplied `hass` object:

```text
GET /api/calendars/{entity_id}?start={timestamp}&end={timestamp}
```

Follow `hass.callApi` path conventions. Do not request a user token.

The API provides events for a date range; entity state attributes alone contain insufficient information. [Home Assistant REST API](https://contributors.home-assistant.io/core/internals/rest-api/).

Determine required ranges from active views:

- Calendar: complete displayed weeks.
- Upcoming: now through the configured horizon.
- Selected-week list: the selected week.

Fetch the union of needed ranges, merging overlapping intervals. Disjoint ranges may be requested separately. Do not retrieve hidden views unnecessarily.

Request each source independently so failures remain isolated.

Treat returned events as already expanded occurrences. Never expand recurrence rules again.

**13. Normalization and calendar correctness**

Normalize event data before rendering:

```ts
type CalendarEvent = {
  id: string;
  sourceId: string;
  title: string;
  location?: string;
  description?: string;
} & (
  | {
      allDay: true;
      startDate: string;
      endDateExclusive: string;
    }
  | {
      allDay: false;
      startMs: number;
      endMs: number;
    }
);
```

Requirements:

- Preserve date-only events as dates.
- Convert timed events to UTC epoch milliseconds.
- Use start-inclusive, end-exclusive intervals.
- An event ending at midnight does not appear on the following day.
- Show multi-day events on every overlapping calendar day.
- Show each occurrence once in the upcoming list.
- Handle zero-duration events returned by the API by their start time.
- Skip malformed events with a source warning; do not crash the card.
- Deduplicate overlapping request results within a source.
- Do not deduplicate across different sources.

Prefer UID plus occurrence identity when available. Otherwise generate a deterministic identity from normalized event fields.

Grid and agenda sorting is all-day first, then start, source order, title, and ID. Upcoming sorting follows section 9.

**14. Timezone and clock behavior**

Use the configured display timezone for boundaries, grouping, labels, and current-event status.

Default to Home Assistant’s configured timezone. Do not silently use the browser timezone.

Use calendar arithmetic rather than adding fixed 24-hour durations.

Update current-time indicators at least once per minute and recompute date-dependent labels at local midnight.

Automatically advance the calendar at a week boundary only if it was following the current week. Preserve a deliberately selected historical or future range.

The card cannot recover original source information already normalized or omitted by a calendar integration. Verify representative feeds during integration testing.

**15. Refresh, caching, and source status**

Refresh active event ranges every five minutes while the page is visible.

Also refresh:

- After reconnection.
- When new ranges are required.
- When returning to a stale page.
- When the user presses a manual refresh control.

Manual refresh retrieves Home Assistant’s available calendar data. It must not invoke `homeassistant.update_entity` or promise an upstream ICS download.

Use memory-only caching:

- Scope caches to the Home Assistant connection, entity, and range.
- Coalesce identical in-flight requests.
- Share results between card instances on the same page where possible.
- Bound cache growth, for example with 50 cached range entries per connection.
- Retain previous successful results while refreshing.
- Prevent old requests from overwriting newer configuration or navigation.

Clear timers, observers, and listeners when disconnected. Pause polling while the page is hidden.

Track:

```text
loading
ready
empty
stale
error
```

Retain cached events after a request failure and mark them stale.

“Last retrieved” means the card’s last successful Home Assistant API request. It must never be labelled “Last ICS sync.”

Do not claim the feed is fresh merely because the API request succeeded.

**16. Visual editor and accessibility**

The visual editor must expose all configuration settings and provide:

- View and arrangement selectors.
- Calendar and upcoming settings.
- Calendar-only entity selector.
- Source name, color, and icon controls.
- Add, remove, and reorder source actions.
- Source connection test.
- Remote Calendar setup guidance.

Generate source IDs when adding sources and preserve them during renaming and reordering.

Emit complete `config-changed` events without mutating input objects. Preserve settings for temporarily hidden views.

Connection tests request calendar events through the same adapter used by the card. An empty successful result is a valid connection.

Accessibility requirements:

- Accessible labels and visible focus.
- Touch targets of at least 44 × 44 CSS pixels.
- Keyboard-operable navigation and selection.
- Dialog focus containment, Escape to close, and focus restoration.
- Source identification beyond color alone.
- Light and dark themes.
- Reduced-motion support.

**17. HACS packaging**

Provide:

```text
src/
tests/
demo/
dist/calendar-week-card.js
hacs.json
package.json
package-lock.json
README.md
LICENSE
CHANGELOG.md
IMPLEMENTATION_STATUS.md
.github/workflows/
```

Suggested HACS metadata:

```json
{
  "name": "Calendar Week Card",
  "filename": "calendar-week-card.js",
  "render_readme": true
}
```

Verify metadata and artifact placement against current [HACS dashboard requirements](https://www.hacs.dev/docs/publish/plugin/).

Support installation through HACS custom repositories using the Dashboard category.

Expected resource:

```text
/hacsfiles/calendar-week-card/calendar-week-card.js
```

Resource type: JavaScript module.

Commit the distributable to `dist/` and attach matching bundles to versioned releases. Include CI for checks and a tagged-release workflow.

Default HACS catalog submission is separate from custom-repository compatibility. Do not publish or submit anything without authorization.

**18. Documentation**

The README must explain:

1. HACS installation and updates.
2. Manual installation.
3. Resource registration troubleshooting.
4. Adding ICS feeds through Remote Calendar.
5. Selecting calendar entities in the card.
6. Every configuration option and default.
7. Examples for all five arrangements.
8. Remote Calendar refresh configuration, including an optional 15-minute automation example based on its current documentation.
9. The distinction between card retrieval and upstream feed refresh.
10. Authentication limitations of Remote Calendar.
11. Timezones, all-day events, source failures, and stale results.
12. Supported and tested Home Assistant versions.

Include actual screenshots and a fixture-based local preview. Never show demonstration events as fallback data in a real dashboard.

**19. Tests and release criteria**

Provide these commands:

```bash
npm ci
npm run lint
npm run typecheck
npm run test
npm run test:e2e
npm run build
npm run dev
```

Use local fixtures and mocked APIs for automated tests.

Test:

- All five arrangements.
- Grid and agenda responsiveness.
- Multiweek navigation and ISO week-year boundaries.
- Sunday and Monday week starts.
- Today/current-week/selected-week styling.
- Upcoming limits and horizon boundaries.
- Ongoing and completed events.
- Relative dates changing at midnight.
- Selected-week filtering and clearing.
- Multiple sources and deterministic ordering.
- All-day exclusive ends and overnight events.
- Multi-day occurrences.
- DST transitions in Europe/Helsinki.
- Browser timezone differing from display timezone.
- Already-expanded recurring occurrences.
- Empty, malformed, unavailable, and partially failing sources.
- Cache reuse, request races, and lifecycle cleanup.
- Editor configuration round-tripping.
- Dialog keyboard behavior and focus restoration.
- Light and dark themes at 375, 768, and 1200 CSS pixels.

Do not test ICS parsing in this repository; that belongs to the upstream integration.

Release acceptance requires:

- All automated checks pass.
- The production bundle works without a development server.
- A real Home Assistant instance displays multiple Remote Calendar feeds.
- HACS custom-repository installation and an update are verified.
- Representative recurring, all-day, and timezone-sensitive events are checked against their source calendars.

Record unavailable manual checks as **unverified**, rather than treating mocked tests as proof.

**20. Implementation sequence**

1. Project setup, configuration schema, card registration, and fixture preview.
2. Event normalization, date arithmetic, sorting, and range planning.
3. Home Assistant API adapter, cache, and source status.
4. Multiweek grid and responsive agenda.
5. Upcoming list and relative dates.
6. Combined layouts and week-selection synchronization.
7. Details dialogs, accessibility, and visual editor.
8. Automated verification, HACS packaging, screenshots, and documentation.

Keep the project runnable after each stage. Track completed work and remaining checks in `IMPLEMENTATION_STATUS.md`.