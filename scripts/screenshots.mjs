/**
 * Capture screenshots of the fixture preview (README + visual review).
 * Usage: npm run build && npm run screenshots
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const root = path.resolve(import.meta.dirname, "..");
const outDir = path.join(root, "screenshots");
const port = 4174;

fs.mkdirSync(outDir, { recursive: true });

const server = spawn("node", ["demo/serve.mjs"], {
  cwd: root,
  env: { ...process.env, PORT: String(port) },
  stdio: "ignore",
});

async function waitForServer() {
  for (let i = 0; i < 50; i += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/demo/index.html`);
      if (response.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Preview server did not start");
}

async function main() {
  await waitForServer();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  await page.goto(`http://127.0.0.1:${port}/demo/index.html`);
  await page.waitForFunction(() => window.__demoReady === true);
  await page.waitForTimeout(600);

  const setArrangement = async (value) => {
    await page.selectOption('[data-testid="arrangement"]', value);
    await page.waitForTimeout(450);
  };
  const setLayout = async (value) => {
    await page.selectOption('[data-testid="calendar-layout"]', value);
    await page.waitForTimeout(450);
  };
  const setWidth = async (value) => {
    await page.click(`[data-testid="width-${value}"]`);
    await page.waitForTimeout(450);
  };
  const setTheme = async (value) => {
    await page.selectOption('[data-testid="theme"]', value);
    await page.waitForTimeout(250);
  };
  const stage = () => page.locator('[data-testid="stage"]');

  async function shot(name) {
    await stage().screenshot({ path: path.join(outDir, name) });
    console.log(`saved screenshots/${name}`);
  }

  await setLayout("grid");
  await setArrangement("calendar:calendar_top");
  await setWidth(1200);
  await setTheme("light");
  await shot("calendar-grid-desktop-light.png");

  await setTheme("dark");
  await shot("calendar-grid-desktop-dark.png");

  await setLayout("auto");
  await setWidth(768);
  await setTheme("light");
  await shot("calendar-agenda-tablet-light.png");

  await setWidth(375);
  await setTheme("dark");
  await shot("calendar-agenda-mobile-dark.png");

  await setArrangement("upcoming:calendar_top");
  await setWidth(375);
  await setTheme("light");
  await shot("upcoming-mobile-light.png");

  await setArrangement("combined:calendar_top");
  await setWidth(1200);
  await setTheme("light");
  await shot("combined-calendar-top-desktop-light.png");

  await setArrangement("combined:list_top");
  await setTheme("dark");
  await shot("combined-list-top-desktop-dark.png");

  await setArrangement("combined:side_by_side");
  await setTheme("light");
  await shot("combined-side-by-side-desktop-light.png");

  await setWidth(768);
  await shot("combined-side-by-side-stacked-tablet-light.png");

  // Event dialog
  await setArrangement("combined:calendar_top");
  await setWidth(1200);
  await page.locator(".up-list .cwc-row").first().click();
  await page.waitForTimeout(300);
  await page.locator("cwc-dialog .dialog").screenshot({ path: path.join(outDir, "event-dialog-light.png") });
  console.log("saved screenshots/event-dialog-light.png");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);

  // Source failure banner
  await page.check('[data-testid="fail-work"]');
  await page.waitForTimeout(500);
  await shot("source-error-desktop-light.png");
  await page.uncheck('[data-testid="fail-work"]');
  await page.waitForTimeout(300);

  // Editor
  await page.locator("#editor-host").scrollIntoViewIfNeeded();
  await page.locator(".editor-pane").screenshot({ path: path.join(outDir, "editor-light.png") });
  console.log("saved screenshots/editor-light.png");

  await browser.close();
  server.kill("SIGTERM");
}

main().catch((err) => {
  console.error(err);
  server.kill("SIGTERM");
  process.exit(1);
});
