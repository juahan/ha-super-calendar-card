Implement the attached “HA Calendar Week — Implementation Specification
v2.0” as a complete Home Assistant custom dashboard card.

Deliver working repository code, automated tests, documentation, a local
preview, and a compiled HACS-installable JavaScript bundle. Continue beyond
planning and scaffolding until the implementation is complete or a concrete
external blocker prevents further progress.

First:
1. Inspect the repository and follow applicable repository instructions.
2. Verify current official Home Assistant custom-card, visual-editor,
   calendar API, Remote Calendar, and HACS dashboard documentation.
3. Inspect the actual APIs of the selected dependencies.
4. Briefly explain your implementation stages, then start coding.

The architecture is fixed:
- One frontend-only HACS dashboard card.
- Home Assistant Remote Calendar handles ICS feeds.
- The card accepts calendar.* entities only.
- No Python integration, direct ICS fetching, ICS parsing, recurrence
  expansion, proxy, calendar credentials, or external service.
- Use TypeScript, Lit, Luxon, Rollup, Vitest, and Playwright.
- Bundle all runtime dependencies into one JavaScript module.

Implement all specified views:
- Multiweek calendar grid.
- Responsive calendar agenda.
- Standalone upcoming-events list.
- Calendar above list.
- List above calendar.
- Calendar and list side by side.
- Week selection with optional list filtering.

Preserve the exact configuration contract and defaults. In particular,
keep view composition separate from calendar presentation, and keep the
upcoming horizon independent of the displayed calendar range.

Use the authenticated Home Assistant calendar API through hass.
Do not rely on next-event entity attributes. Do not re-expand recurrence.
Do not imply that a card refresh downloads the original ICS feed.

Keep configuration, range planning, data retrieval, normalization, date
logic, components, and editor code separate. Use pure functions where
they make date and event behavior easier to verify.

Use local fixtures and mocked requests for automated tests. Cover date-only
events, exclusive end dates, DST, multi-day events, ongoing events, range
boundaries, sorting, navigation races, caching, partial failures, and editor
round-tripping.

Build a fixture-based preview and inspect mobile, tablet, and desktop
layouts in light and dark themes. Verify keyboard navigation and dialogs.

Make routine implementation decisions independently. If a genuine conflict
requires changing the specification, explain it before changing the contract.
Do not quietly omit features or replace incomplete functionality with mock
behavior in the production card.

Maintain IMPLEMENTATION_STATUS.md with:
- Completed requirements.
- Outstanding work.
- Commands actually run and their results.
- Unverified manual acceptance checks.
- Precise continuation instructions if the work spans multiple sessions.

Run and fix:
npm run lint
npm run typecheck
npm run test
npm run test:e2e
npm run build

Deliver all repository files required by the specification, including the
compiled dist/calendar-week-card.js, HACS metadata, CI/release workflows,
README, license, changelog, and screenshots.

Do not claim real Home Assistant installation, HACS installation, upstream
feed correctness, or update compatibility unless actually verified.
Clearly distinguish automated checks from manual checks.

Do not publish releases, deploy, or submit to the HACS catalog without
explicit authorization.

Finish with:
1. What was implemented.
2. Checks run and their results.
3. Remaining limitations or unverified requirements.
4. Exact instructions to install and try the card.

The specification is at spec.md.