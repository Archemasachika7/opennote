import { test, expect } from "@playwright/test";
import { fixture, newNotebook } from "./helpers";

test("draw, add text, smart-paste a React artifact, reload: everything is still there", async ({ page }) => {
  test.setTimeout(60_000);
  await newNotebook(page);

  // pen stroke on page 1
  await page.locator("[data-testid=ink-surface][data-loaded]").first().waitFor();
  await page.evaluate(() => {
    const el = document.querySelector("[data-testid=ink-surface]")!;
    const r = el.getBoundingClientRect();
    const ev = (type: string, i: number) => new PointerEvent(type, {
      bubbles: true, pointerId: 9, pointerType: "pen", pressure: 0.5, buttons: type === "pointerup" ? 0 : 1,
      clientX: r.left + 80 + i * 12, clientY: r.top + 120 + Math.sin(i / 2) * 20,
    });
    el.dispatchEvent(ev("pointerdown", 0));
    for (let i = 1; i < 25; i++) el.dispatchEvent(ev("pointermove", i));
    el.dispatchEvent(ev("pointerup", 25));
  });

  // text page between
  await page.getByRole("button", { name: "Insert page at 2" }).click();
  await page.getByRole("menuitem", { name: "Text page" }).click();
  const editor = page.locator(".text-doc");
  await editor.click();
  await page.keyboard.type("Lecture 4 notes");
  await page.locator(".nb-scroll").click({ position: { x: 5, y: 5 } }); // blur -> save
  await expect.poll(() => page.evaluate(() => new Promise<string>((resolve) => {
    const req = indexedDB.open("opennote");
    req.onsuccess = () => {
      const all = req.result.transaction("pages").objectStore("pages").getAll();
      all.onsuccess = () => resolve(JSON.stringify(all.result.filter((p: { kind: string }) => p.kind === "text")));
    };
  })), { timeout: 10000 }).toContain("Lecture 4 notes");

  // smart paste of an AI artifact
  await page.evaluate((src) => {
    const dt = new DataTransfer();
    dt.setData("text/plain", src);
    document.body.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true }));
  }, fixture("counter.jsx"));
  await page.getByRole("button", { name: "Create" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.frameLocator("iframe[title=Counter]").locator("#inc")).toHaveText("Clicked 0 times", { timeout: 15000 });

  await page.reload();
  const thumbs = page.getByTestId("thumb");
  await expect(thumbs).toHaveCount(3);
  await expect(page.locator("[data-testid=thumb][data-live=true]")).toHaveCount(1);
  // pages mount only near the viewport: bring each into view until the text page shows up
  for (const w of await page.locator("section.page-wrap").all()) {
    await w.scrollIntoViewIfNeeded();
    if (await page.locator(".text-doc").count()) break;
  }
  await expect(page.locator(".text-doc")).toContainText("Lecture 4 notes");
  const strokes = await page.evaluate(() => new Promise<number>((resolve) => {
    const req = indexedDB.open("opennote");
    req.onsuccess = () => {
      const c = req.result.transaction("strokes").objectStore("strokes").count();
      c.onsuccess = () => resolve(c.result);
    };
  }));
  expect(strokes).toBe(1);
  await page.locator("section.page-wrap.live").scrollIntoViewIfNeeded();
  const frame = page.frameLocator("iframe[title=Counter]");
  await frame.locator("#inc").click();
  await expect(frame.locator("#inc")).toHaveText("Clicked 1 times");
});
