/**
 * Post-build step: maintain the HACS compatibility alias.
 *
 * The spec fixes the bundle name to `dist/calendar-week-card.js` and the card
 * type to `custom:calendar-week-card`. HACS also wants a `.js` file whose name
 * matches the *repository* name (`ha-super-calendar-card`). This script keeps
 * a byte-identical copy under that name so custom-repository installation
 * works regardless of which resolution HACS uses.
 */
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const canonical = path.join(root, "dist", "calendar-week-card.js");
const alias = path.join(root, "dist", "ha-super-calendar-card.js");

if (!fs.existsSync(canonical)) {
  console.error("dist/calendar-week-card.js is missing; run rollup first.");
  process.exit(1);
}
fs.copyFileSync(canonical, alias);
console.log("dist/ha-super-calendar-card.js kept in sync with dist/calendar-week-card.js");
