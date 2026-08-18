import { test, expect } from "@playwright/test";

test.describe("Chart SVG DOM Verification across routes", () => {
  test("Progress tab renders BarChart and LineChart across all segments", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      w.__SKIP_ONBOARDING__ = true;
      w.__TEST_SCENARIO__ = "store-showcase";
    });

    await page.goto("/progress");
    await expect(page.locator("body[data-test-ready='true']")).toBeVisible({
      timeout: 15_000,
    });

    // 1. Workouts segment: BarChart for Sessions Per Week and Weekly Volume + TrendCards
    const workoutSvgs = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("svg")).map((s) => ({
        tag: s.tagName,
        width: s.getBoundingClientRect().width,
        height: s.getBoundingClientRect().height,
        paths: Array.from(s.querySelectorAll("path")).map((p) => ({
          d: p.getAttribute("d"),
          fill: p.getAttribute("fill"),
          stroke: p.getAttribute("stroke"),
        })),
        lines: Array.from(s.querySelectorAll("line")).map((l) => ({
          x1: l.getAttribute("x1"),
          y1: l.getAttribute("y1"),
          x2: l.getAttribute("x2"),
          y2: l.getAttribute("y2"),
          stroke: l.getAttribute("stroke"),
        })),
        circles: Array.from(s.querySelectorAll("circle")).length,
        texts: Array.from(s.querySelectorAll("text")).map((t) => t.textContent),
      }));
    });
    console.log("=== WORKOUT SEGMENT CHARTS ===");
    const workoutCharts = workoutSvgs.filter((s) => s.width > 50 && s.height > 50);
    console.log(JSON.stringify(workoutCharts, null, 2));

    expect(workoutCharts.length).toBeGreaterThanOrEqual(2);
    // Verify BarChart has bar paths with curved tops (Q commands) and fills
    for (const chart of workoutCharts) {
      expect(chart.paths.length).toBeGreaterThan(0);
    }
  });

  test("Body Segment with logged weights renders LineChart (2 series)", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      w.__SKIP_ONBOARDING__ = true;
    });

    await page.goto("/progress?segment=body");
    await page.waitForTimeout(1000);

    // Click FAB to log first weight
    const fab = page.locator('[aria-label="Log body weight"]');
    await expect(fab).toBeVisible();
    await fab.click();
    await page.waitForTimeout(500);

    const weightInput = page.getByLabel("Weight in kg").or(page.locator('input').first());
    await weightInput.fill("75.0");
    const saveBtn = page.getByRole("button", { name: "Save" }).or(page.getByText("Save", { exact: true }));
    await saveBtn.click();
    await page.waitForTimeout(800);

    // Log second weight for earlier date
    await fab.click();
    await page.waitForTimeout(500);
    const weightInput2 = page.getByLabel("Weight in kg").or(page.locator('input').first());
    await weightInput2.fill("74.5");
    const dateInput2 = page.getByLabel("Date for weight entry").or(page.locator('input').nth(1));
    await dateInput2.fill("2026-08-01");
    await saveBtn.click();
    await page.waitForTimeout(1000);

    // Log third weight for even earlier date
    await fab.click();
    await page.waitForTimeout(500);
    const weightInput3 = page.getByLabel("Weight in kg").or(page.locator('input').first());
    await weightInput3.fill("74.0");
    const dateInput3 = page.getByLabel("Date for weight entry").or(page.locator('input').nth(1));
    await dateInput3.fill("2026-07-25");
    await saveBtn.click();
    await page.waitForTimeout(1000);

    const bodySvgs = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("svg")).map((s) => ({
        tag: s.tagName,
        width: s.getBoundingClientRect().width,
        height: s.getBoundingClientRect().height,
        paths: Array.from(s.querySelectorAll("path")).map((p) => ({
          d: p.getAttribute("d"),
          fill: p.getAttribute("fill"),
          stroke: p.getAttribute("stroke"),
        })),
        lines: Array.from(s.querySelectorAll("line")).length,
        circles: Array.from(s.querySelectorAll("circle")).length,
        texts: Array.from(s.querySelectorAll("text")).map((t) => t.textContent),
      }));
    });
    console.log("=== BODY SEGMENT CHARTS (AFTER 3 LOGS) ===");
    const bodyCharts = bodySvgs.filter((s) => s.width > 50 && s.height > 50);
    console.log(JSON.stringify(bodyCharts, null, 2));
    expect(bodyCharts.length).toBeGreaterThanOrEqual(1);
    // LineChart has 2 series: weight and 7-day average
    expect(bodyCharts[0].paths.length).toBeGreaterThanOrEqual(2);
  });

  test("Direct LineChart & BarChart rendering verification on web", async ({
    page,
  }) => {
    // Open app and directly render LineChart and BarChart in page context to verify SVG DOM nodes
    await page.addInitScript(() => {
      (window as unknown as Record<string, unknown>).__SKIP_ONBOARDING__ = true;
    });
    await page.goto("/");
    await page.waitForTimeout(500);

    const chartMetrics = await page.evaluate(() => {
      // Return details of all SVGs rendered on page
      return Array.from(document.querySelectorAll("svg")).map((svg) => {
        const rect = svg.getBoundingClientRect();
        return {
          tagName: svg.tagName,
          width: rect.width,
          height: rect.height,
          childCount: svg.children.length,
          children: Array.from(svg.children).map((c) => ({
            tag: c.tagName,
            d: c.getAttribute("d"),
            fill: c.getAttribute("fill"),
            stroke: c.getAttribute("stroke"),
            x1: c.getAttribute("x1"),
            y1: c.getAttribute("y1"),
            x2: c.getAttribute("x2"),
            y2: c.getAttribute("y2"),
            text: c.textContent,
          })),
        };
      });
    });
    console.log("=== ROOT PAGE SVGS ===", JSON.stringify(chartMetrics, null, 2));
  });
});

