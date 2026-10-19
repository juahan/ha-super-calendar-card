import { test, expect, type Page } from "@playwright/test";

const DEMO = "/demo/index.html";

async function openDemo(page: Page): Promise<void> {
  await page.goto(DEMO);
  await page.waitForFunction(() => (window as any).__demoReady === true);
  // Allow the mock API latency + first render to settle.
  await page.waitForTimeout(600);
}

async function setArrangement(page: Page, value: string): Promise<void> {
  await page.selectOption('[data-testid="arrangement"]', value);
  await page.waitForTimeout(500);
}

async function setLayout(page: Page, value: string): Promise<void> {
  await page.selectOption('[data-testid="calendar-layout"]', value);
  await page.waitForTimeout(500);
}

async function setWidth(page: Page, value: number): Promise<void> {
  await page.click(`[data-testid="width-${value}"]`);
  await page.waitForTimeout(500);
}

async function activeElementInfo(page: Page): Promise<string> {
  return page.evaluate(() => {
    const card = document.querySelector("calendar-week-card") as any;
    const dialog = card?.shadowRoot?.querySelector("cwc-dialog") as any;
    const el: Element | null =
      dialog?.shadowRoot?.activeElement ??
      card?.shadowRoot?.activeElement ??
      document.activeElement;
    if (!el) return "none";
    const cls = typeof el.className === "string" ? el.className : "";
    return `${el.tagName.toLowerCase()} ${cls}`.trim();
  });
}

test.describe("view arrangements (§4)", () => {
  test("calendar only renders just the calendar", async ({ page }) => {
    await openDemo(page);
    await setArrangement(page, "calendar:calendar_top");
    await expect(page.locator("calendar-week-card .cal-section")).toBeVisible();
    await expect(page.locator("calendar-week-card .up-section")).toHaveCount(0);
  });

  test("upcoming only renders just the list", async ({ page }) => {
    await openDemo(page);
    await setArrangement(page, "upcoming:calendar_top");
    await expect(page.locator("calendar-week-card .up-section")).toBeVisible();
    await expect(page.locator("calendar-week-card .cal-section")).toHaveCount(0);
  });

  test("combined calendar_top stacks calendar above list", async ({ page }) => {
    await openDemo(page);
    await setArrangement(page, "combined:calendar_top");
    await setWidth(page, 1200);
    const order = await page.evaluate(() => {
      const stack = document
        .querySelector("calendar-week-card")!
        .shadowRoot!.querySelector(".cwc-stacked")!;
      return [...stack.children].map((child) => child.className);
    });
    expect(order[0]).toContain("cwc-calsurface");
    expect(order[1]).toContain("up-section");
  });

  test("combined list_top stacks list above calendar", async ({ page }) => {
    await openDemo(page);
    await setArrangement(page, "combined:list_top");
    await setWidth(page, 1200);
    const order = await page.evaluate(() => {
      const stack = document
        .querySelector("calendar-week-card")!
        .shadowRoot!.querySelector(".cwc-stacked")!;
      return [...stack.children].map((child) => child.className);
    });
    expect(order[0]).toContain("up-section");
    expect(order[1]).toContain("cwc-calsurface");
  });

  test("side_by_side is 60/40 wide and stacks below 1100px", async ({ page }) => {
    await openDemo(page);
    await setArrangement(page, "combined:side_by_side");
    await setWidth(page, 1200);
    await expect(page.locator("calendar-week-card .cwc-side-by-side")).toBeVisible();
    const ratio = await page.evaluate(() => {
      const root = document.querySelector("calendar-week-card")!.shadowRoot!;
      const cal = root.querySelector(".cwc-side-calendar")!.getBoundingClientRect();
      const up = root.querySelector(".cwc-side-upcoming")!.getBoundingClientRect();
      return { cal: cal.width, up: up.width };
    });
    expect(ratio.cal / (ratio.cal + ratio.up)).toBeGreaterThan(0.5);
    expect(ratio.cal / (ratio.cal + ratio.up)).toBeLessThan(0.7);

    await setWidth(page, 768);
    await expect(page.locator("calendar-week-card .cwc-side-by-side")).toHaveCount(0);
    await expect(page.locator("calendar-week-card .cwc-stacked")).toBeVisible();
  });
});

test.describe("grid and agenda responsiveness (§8)", () => {
  test("auto layout uses the grid at >= 840px and the agenda below", async ({ page }) => {
    await openDemo(page);
    await setLayout(page, "auto");
    await setWidth(page, 1200);
    await expect(page.locator("calendar-week-card .grid")).toBeVisible();
    await setWidth(page, 768);
    await expect(page.locator("calendar-week-card .agenda")).toBeVisible();
    await expect(page.locator("calendar-week-card .grid")).toHaveCount(0);
    await setWidth(page, 375);
    await expect(page.locator("calendar-week-card .agenda")).toBeVisible();
  });

  test("forced grid scrolls horizontally in narrow containers", async ({ page }) => {
    await openDemo(page);
    await setLayout(page, "grid");
    await setWidth(page, 375);
    await expect(page.locator("calendar-week-card .grid.forced")).toBeVisible();
    const scrollable = await page.evaluate(() => {
      const scroller = document
        .querySelector("calendar-week-card")!
        .shadowRoot!.querySelector(".grid-scroll") as HTMLElement;
      return scroller.scrollWidth > scroller.clientWidth;
    });
    expect(scrollable).toBe(true);
  });

  test("forced agenda stays vertical at desktop width", async ({ page }) => {
    await openDemo(page);
    await setLayout(page, "agenda");
    await setWidth(page, 1200);
    await expect(page.locator("calendar-week-card .agenda")).toBeVisible();
    await expect(page.locator("calendar-week-card .grid")).toHaveCount(0);
  });
});

test.describe("navigation (§7)", () => {
  test("prev/next shift by one week and Today returns", async ({ page }) => {
    await openDemo(page);
    await setLayout(page, "grid");
    await setWidth(page, 1200);
    const label = () => page.locator("calendar-week-card .cal-range").textContent();
    const initial = await label();
    await page.click('calendar-week-card button[aria-label="Next week"]');
    await expect.poll(async () => (await label())!).not.toBe(initial);
    await page.click('calendar-week-card button[aria-label="Previous week"]');
    await expect.poll(async () => (await label())!).toBe(initial!);
    await page.click('calendar-week-card button[aria-label="Previous week"]');
    const past = await label();
    await page.click("calendar-week-card .cal-controls .cwc-text-button");
    await expect.poll(async () => (await label())!).toBe(initial!);
    expect(past).not.toBe(initial);
  });
});

test.describe("week selection and list filtering (§10)", () => {
  test("filters the list to the selected week and can be cleared", async ({ page }) => {
    await openDemo(page);
    await setLayout(page, "grid");
    await setWidth(page, 1200);

    // Enable follow_selected_week through the visual editor.
    await page.locator(".editor-pane").scrollIntoViewIfNeeded();
    const follow = page
      .locator("calendar-week-card-editor label.field.checkbox", { hasText: "Filter list to the selected week" })
      .locator("input");
    await follow.check();
    await page.waitForTimeout(500);

    const upText = () => page.locator("calendar-week-card .up-section").innerText();
    expect(await upText()).toContain("Upcoming");

    await page.locator("calendar-week-card .wk-btn").first().click();
    await page.waitForTimeout(500);
    expect(await upText()).not.toContain("Upcoming");
    expect(await upText()).toContain("Clear week selection");

    await page.locator("calendar-week-card .up-actions button", { hasText: "Clear week selection" }).click();
    await page.waitForTimeout(500);
    expect(await upText()).toContain("Upcoming");
  });

  test("week selection is keyboard accessible and announces ISO week-year", async ({ page }) => {
    await openDemo(page);
    await setLayout(page, "grid");
    await setWidth(page, 1200);
    const weekButton = page.locator("calendar-week-card .wk-btn").first();
    const aria = await weekButton.getAttribute("aria-label");
    expect(aria).toMatch(/Week \d+ of \d{4}/);
    await weekButton.focus();
    await page.keyboard.press("Enter");
    await expect(weekButton).toHaveAttribute("aria-pressed", "true");
  });

  test("calendar-only mode opens the week dialog", async ({ page }) => {
    await openDemo(page);
    await setArrangement(page, "calendar:calendar_top");
    await setLayout(page, "grid");
    await setWidth(page, 1200);
    await page.locator("calendar-week-card .wk-btn").first().click();
    await expect(page.locator("cwc-dialog .dialog")).toBeVisible();
    await expect(page.locator("cwc-dialog .dialog-title")).toContainText("Events in");
  });
});

test.describe("dialogs (§11, §16)", () => {
  test("+N more opens every event of the date; Escape closes and restores focus", async ({ page }) => {
    await openDemo(page);
    await setLayout(page, "grid");
    await setWidth(page, 1200);
    const more = page.locator("calendar-week-card .more-btn").first();
    await more.click();
    const dialog = page.locator("cwc-dialog .dialog");
    await expect(dialog).toBeVisible();
    const rows = page.locator("cwc-dialog .dialog-list .cwc-row");
    expect(await rows.count()).toBeGreaterThan(3);
    await expect(page.locator("cwc-dialog .dialog-title")).toContainText("Events on");

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect.poll(async () => activeElementInfo(page)).toContain("more-btn");
  });

  test("dialog contains title, source, date range, location and description", async ({ page }) => {
    await openDemo(page);
    await setArrangement(page, "upcoming:calendar_top");
    await setWidth(page, 768);
    await page.locator("calendar-week-card .up-list .cwc-row", { hasText: "Dentist appointment" }).first().click();
    const dialog = page.locator("cwc-dialog .dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Dentist appointment");
    await expect(dialog).toContainText("Source");
    await expect(dialog).toContainText("Family");
    await expect(dialog).toContainText("When");
    await expect(dialog).toContainText("Location");
    await expect(dialog).toContainText("Main street 5");
    await expect(dialog).toContainText("Description");
    await expect(dialog).toContainText("Bring the insurance card");
  });

  test("focus stays contained in the dialog while tabbing", async ({ page }) => {
    await openDemo(page);
    await setLayout(page, "grid");
    await setWidth(page, 1200);
    await page.locator("calendar-week-card .more-btn").first().click();
    await expect(page.locator("cwc-dialog .dialog")).toBeVisible();
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press("Tab");
      const info = await activeElementInfo(page);
      expect(info).not.toBe("none");
      // The active element must live inside the dialog subtree.
      const inside = await page.evaluate(() => {
        const card = document.querySelector("calendar-week-card") as any;
        const dialog = card?.shadowRoot?.querySelector("cwc-dialog") as any;
        return dialog?.shadowRoot?.activeElement != null;
      });
      expect(inside).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(page.locator("cwc-dialog .dialog")).toBeHidden();
  });

  test("close button closes the dialog", async ({ page }) => {
    await openDemo(page);
    await setLayout(page, "grid");
    await setWidth(page, 1200);
    await page.locator("calendar-week-card .cwc-chip").first().click();
    await expect(page.locator("cwc-dialog .dialog")).toBeVisible();
    await page.locator("cwc-dialog button[aria-label='Close']").click();
    await expect(page.locator("cwc-dialog .dialog")).toBeHidden();
  });
});

test.describe("upcoming list (§9, §11)", () => {
  test("shows relative labels, in-progress indicator and displayed count", async ({ page }) => {
    await openDemo(page);
    await setArrangement(page, "upcoming:calendar_top");
    const up = page.locator("calendar-week-card .up-section");
    await expect(up).toContainText("Today ·");
    await expect(up).toContainText("In progress");
    const badge = page.locator("calendar-week-card .up-count");
    await expect(badge).toBeVisible();
  });
});

test.describe("source failures (§6, §8)", () => {
  test("names failing sources and keeps the others working", async ({ page }) => {
    await openDemo(page);
    await setLayout(page, "grid");
    await setWidth(page, 1200);
    await page.check('[data-testid="fail-work"]');
    await page.waitForTimeout(600);
    const body = page.locator("calendar-week-card");
    await expect(body).toContainText("Some calendars could not be loaded");
    await expect(body).toContainText("Work");
    // Family events are still rendered (this all-day event leads today's cell).
    await expect(body).toContainText("School holiday");
  });
});

test.describe("visual editor (§16)", () => {
  test("editing the title updates the card and emits the full config", async ({ page }) => {
    await openDemo(page);
    await page.locator(".editor-pane").scrollIntoViewIfNeeded();
    const title = page
      .locator("calendar-week-card-editor label.field", { hasText: "Card title" })
      .locator("input");
    await title.fill("Renamed by editor");
    await page.waitForTimeout(300);
    await expect(page.locator("calendar-week-card .cwc-card-title")).toHaveText("Renamed by editor");
    const emitted = await page.locator('[data-testid="config-out"]').textContent();
    expect(emitted).toContain("Renamed by editor");
    expect(emitted).toContain('"sources"');
    expect(emitted).toContain("calendar.family");
  });

  test("connection test reports success through the same adapter", async ({ page }) => {
    await openDemo(page);
    await page.locator(".editor-pane").scrollIntoViewIfNeeded();
    const row = page.locator("calendar-week-card-editor .source-row").first();
    await row.locator("button", { hasText: "Test connection" }).click();
    await expect(row).toContainText("Connected", { timeout: 5000 });
  });
});

test.describe("themes and widths (§16, §19)", () => {
  for (const width of [375, 768, 1200]) {
    for (const theme of ["light", "dark"]) {
      test(`renders at ${width}px in ${theme} theme`, async ({ page }) => {
        await openDemo(page);
        await page.selectOption('[data-testid="theme"]', theme);
        await setWidth(page, width);
        await expect(page.locator("calendar-week-card")).toBeVisible();
        const box = await page.locator('[data-testid="stage"]').boundingBox();
        expect(box!.width).toBeLessThanOrEqual(width + 1);
        const background = await page.evaluate(() => {
          const card = document.querySelector("calendar-week-card")!;
          return getComputedStyle(card).getPropertyValue("--ha-card-background").trim();
        });
        expect(background.length).toBeGreaterThan(0);
        await expect(page.locator("calendar-week-card .cal-section")).toBeVisible();
      });
    }
  }
});
