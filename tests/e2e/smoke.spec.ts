import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Smoke: SSG homepage + maker island, manual sample → grid → PDF download.
 * Prefers preview of a prior `pnpm --filter @acm/web build` (webServer in config).
 */
test.describe("maker smoke", () => {
  test("home has English maker CTA and no zh locale", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#maker")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/crossword/i);
    expect(page.url()).not.toMatch(/\/zh\//);
  });

  test("manual sample builds a grid and downloads a student PDF", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#maker")).toBeVisible();

    // Topic mode is default — switch to manual via sample loader on Topic panel,
    // or click Words + clues then load sample.
    const sample = page.getByRole("button", { name: /Load sample words/i });
    if (await sample.isVisible()) {
      await sample.click();
    } else {
      await page.getByRole("button", { name: /Words \+ clues|Manual/i }).first().click();
      await page.getByRole("button", { name: /Load sample|sample/i }).first().click();
    }

    const build = page.getByRole("button", { name: /Build grid/i });
    await expect(build).toBeVisible({ timeout: 15_000 });
    await build.click();

    await expect(page.locator(".maker-pane-grid")).toBeVisible();
    // Grid cells or SVG preview should appear after build.
    await expect(page.locator("#maker")).toContainText(/Across|Down|Grid/i, { timeout: 20_000 });

    const pdfBtn = page.getByRole("button", { name: /Export PDF/i });
    await expect(pdfBtn).toBeEnabled({ timeout: 20_000 });

    const downloadPromise = page.waitForEvent("download", { timeout: 30_000 });
    await pdfBtn.click();
    const download = await downloadPromise;
    const suggested = download.suggestedFilename();
    expect(suggested.toLowerCase()).toMatch(/\.pdf$/);

    const path = await download.path();
    if (path) {
      const buf = readFileSync(path);
      expect(buf.subarray(0, 4).toString("utf8")).toBe("%PDF");
    }
  });

  test("examples index is crawlable HTML", async ({ page }) => {
    const res = await page.goto("/examples/");
    expect(res?.ok()).toBeTruthy();
    const html = await page.content();
    expect(html).toMatch(/Solar System|example/i);
    expect(html).not.toMatch(/lang=["']zh/);
  });
});

test.describe("static SEO fixtures", () => {
  test("robots and redirects exist in web public/", () => {
    const robots = readFileSync(join(process.cwd(), "apps/web/public/robots.txt"), "utf8");
    expect(robots).toContain("Disallow: /p/");
    const redirects = readFileSync(join(process.cwd(), "apps/web/public/_redirects"), "utf8");
    expect(redirects).toContain("/app/packs/*");
    expect(redirects).toContain("/app/puzzles/");
  });
});
