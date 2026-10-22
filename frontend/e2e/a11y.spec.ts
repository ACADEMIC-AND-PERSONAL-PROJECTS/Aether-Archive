import { test, expect, type Page } from "@playwright/test";
import path from "node:path";

/**
 * WCAG AA contrast, measured on painted pixels in Chromium rather than in jsdom.
 *
 * jsdom has no layout, so axe reports `color-contrast` as incomplete in the unit suite. This test
 * renders the production bundle, stubs the two read endpoints, scrolls each dump so its aura theme
 * is active, and audits River + Curate at the three review widths.
 */

const AXE = path.resolve(process.cwd(), "node_modules/axe-core/axe.min.js");

// A 1x1 PNG: the layout and the painted background are what matter, not the photograph.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

const photo = (id: string, category: string, uploadedAt: string) => ({
  id,
  url: `/images/${id}.png`,
  category,
  uploadedAt,
});

const DUMP_PHOTOS = Array.from({ length: 6 }, (_, index) =>
  photo(`e2e-${index + 1}`, "dump", `2026-10-01T12:0${index}:00Z`),
);

const DUMPS = [
  {
    id: "e2e-light-aura",
    // The light-theme case that produced the 2.43:1 regression: dark text over a light aura.
    title: "Light aura",
    backgroundColor: "#eb6a6a",
    photos: DUMP_PHOTOS,
    createdAt: "2026-10-05T18:00:00Z",
  },
  {
    id: "e2e-dark-aura",
    title: "Dark aura",
    backgroundColor: "#0b0b0d",
    photos: DUMP_PHOTOS,
    createdAt: "2026-09-15T18:00:00Z",
  },
];

const PHOTOS = [
  photo("e2e-single-1", "pics", "2026-10-20T10:00:00Z"),
  photo("e2e-single-2", "anime", "2026-10-18T10:00:00Z"),
  photo("e2e-single-3", "pics", "2026-10-16T10:00:00Z"),
];

async function audit(page: Page): Promise<string[]> {
  await page.addScriptTag({ path: AXE });
  return page.evaluate(async () => {
    type AxeNode = { target: Array<string | number>; failureSummary?: string };
    type AxeViolation = { id: string; nodes: AxeNode[] };
    const axe = (
      window as unknown as {
        axe: {
          run: (context: Document, options: unknown) => Promise<{ violations: AxeViolation[] }>;
        };
      }
    ).axe;
    const results = await axe.run(document, {
      runOnly: { type: "rule", values: ["color-contrast"] },
    });
    return results.violations.flatMap((violation) =>
      violation.nodes.map(
        (node) => `${violation.id} ${node.target.join(" ")}: ${node.failureSummary ?? ""}`,
      ),
    );
  });
}

test("River and Curate keep text at WCAG AA contrast at 320/768/1280", async ({ page }) => {
  // A stored aura from a previous run must not decide the Curate colours under test.
  await page.addInitScript(() => window.sessionStorage.clear());
  await page.route("**/api/v1/photos", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(PHOTOS),
    }),
  );
  await page.route("**/api/v1/dumps", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(DUMPS),
    }),
  );
  await page.route("**/images/**", (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: PNG }),
  );

  for (const width of [320, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });

    await page.goto("/river");
    await page.waitForSelector('main[data-state="ready"]');
    const dumps = page.locator("[data-dump-id]");
    const dumpCount = await dumps.count();
    expect(dumpCount).toBe(DUMPS.length);

    for (let index = 0; index < dumpCount; index += 1) {
      await dumps.nth(index).evaluate((element) => element.scrollIntoView({ block: "center" }));
      // The aura transition is 320 ms; measure the painted end state.
      await page.waitForTimeout(500);
      expect(await audit(page), `River dump ${index + 1} at ${width}px`).toEqual([]);
    }

    await page.goto("/curate");
    await page.waitForSelector('main[data-state="idle"]');
    // Match the River wait: the aura tokens are registered @property transitions; audit the end state.
    await page.waitForTimeout(500);
    expect(await audit(page), `Curate at ${width}px`).toEqual([]);
  }
});
