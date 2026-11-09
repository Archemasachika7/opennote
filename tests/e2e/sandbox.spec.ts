import { test, expect } from "@playwright/test";
import { addLivePage, fixture, newNotebook } from "./helpers";

test("hostile artifact cannot touch the app or its storage", async ({ page }) => {
  await newNotebook(page);
  const url = page.url();
  await addLivePage(page, fixture("hostile.html"));
  // regression: the live page section must stay in the page column (a .live class collision once made it absolute)
  await expect(page.locator("section.page-wrap.live")).toHaveCSS("position", "static");
  const frame = page.frameLocator("iframe[title=Hostile]");
  await expect(frame.locator("#r-top")).toBeVisible();
  await expect(frame.locator("#r-parent")).toHaveText("parent: BLOCKED");
  await expect(frame.locator("#r-indexedDB")).toHaveText("indexedDB: BLOCKED");
  await expect(frame.locator("#r-cookie")).toHaveText("cookie: BLOCKED");
  await expect(frame.locator("#r-localStorage")).toHaveText("localStorage: BLOCKED");
  await page.waitForTimeout(500);
  expect(page.url()).toBe(url);
  await expect(page.locator("body")).not.toHaveText("pwned");
  await page.getByRole("button", { name: "Back to library" }).click();
  await expect(page.getByRole("heading", { name: "OpenNote" })).toBeVisible();
});

test("an artifact stuck in an infinite loop can be stopped", async ({ page }) => {
  await newNotebook(page);
  await addLivePage(page, fixture("loop.html"));
  await expect(page.locator("iframe[title=Loop]")).toBeAttached();
  await page.waitForTimeout(800);
  const t0 = Date.now();
  await page.getByRole("button", { name: "Stop" }).click({ timeout: 2000 });
  await expect(page.locator("iframe[title=Loop]")).toHaveCount(0, { timeout: 2000 });
  expect(Date.now() - t0).toBeLessThan(2000);
});

test("a Claude-style React artifact runs without internet and is interactive", async ({ page }) => {
  const external: string[] = [];
  await page.route("**/*", (route) => {
    const u = new URL(route.request().url());
    if (u.hostname === "localhost" || u.protocol === "data:" || u.protocol === "blob:") return route.continue();
    external.push(u.href);
    return route.abort();
  });
  await newNotebook(page);
  await addLivePage(page, fixture("counter.jsx"));
  const frame = page.frameLocator("iframe[title=Counter]");
  await expect(frame.locator("#inc")).toHaveText("Clicked 0 times", { timeout: 15000 });
  await frame.locator("#inc").click();
  await frame.locator("#inc").click();
  await expect(frame.locator("#inc")).toHaveText("Clicked 2 times");
  expect(external).toEqual([]);
});
