import { test, expect, type Page } from "@playwright/test";
import { newNotebook } from "./helpers";

/** Read all rows of an IndexedDB store of the app's database. */
const rows = (page: Page, store: string) => page.evaluate((s) => new Promise<unknown[]>((resolve) => {
  const req = indexedDB.open("opennote");
  req.onsuccess = () => {
    const all = req.result.transaction(s).objectStore(s).getAll();
    all.onsuccess = () => resolve(all.result);
  };
}), store);

async function penLine(page: Page, selector = "[data-testid=ink-surface]") {
  await page.evaluate((sel) => {
    const el = document.querySelector(sel)!;
    const r = el.getBoundingClientRect();
    const ev = (type: string, i: number) => new PointerEvent(type, {
      bubbles: true, pointerId: 7, pointerType: "pen", pressure: 0.5, buttons: type === "pointerup" ? 0 : 1,
      clientX: r.left + 120 + i * 10, clientY: r.top + 160 + Math.sin(i / 3) * 12,
    });
    el.dispatchEvent(ev("pointerdown", 0));
    for (let i = 1; i < 20; i++) el.dispatchEvent(ev("pointermove", i));
    el.dispatchEvent(ev("pointerup", 20));
  }, selector);
}

test("whiteboard: create, draw, zoom, keep after reload", async ({ page }) => {
  await page.goto("/#/library");
  await page.getByRole("button", { name: "More new items" }).click();
  await page.getByRole("menuitem", { name: "New whiteboard" }).click();
  const stage = page.getByTestId("board-stage");
  await expect(stage).toBeVisible();
  await expect(page.getByTestId("minimap")).toBeVisible();
  await page.locator("[data-testid=ink-surface][data-loaded]").waitFor();
  await penLine(page);
  await expect.poll(async () => (await rows(page, "strokes")).length).toBe(1);

  await expect(page.getByText("100%")).toBeVisible();
  const box = (await stage.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -300);
  await page.keyboard.up("Control");
  await expect(page.getByText("100%")).toHaveCount(0);

  await page.getByRole("button", { name: "Add board" }).click();
  await expect(page.getByRole("button", { name: "Board 2", exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByTestId("board-stage")).toBeVisible();
  await expect(page.getByRole("button", { name: "Board 2", exact: true })).toBeVisible();
  expect((await rows(page, "strokes")).length).toBe(1);
});

test("study set: write a card, practise it, learn it", async ({ page }) => {
  await page.goto("/#/library");
  await page.getByRole("button", { name: "More new items" }).click();
  await page.getByRole("menuitem", { name: "New study set" }).click();
  await expect(page.getByTestId("study-set")).toBeVisible();
  await page.getByRole("button", { name: "Add card" }).click();
  await page.getByRole("textbox", { name: "Question 1" }).fill("Kahn's algorithm sorts what?");
  await page.getByRole("textbox", { name: "Answer 1" }).fill("A DAG, topologically");
  await page.getByRole("tab", { name: "Practice" }).click();
  await expect(page.getByText("Kahn's algorithm sorts what?")).toBeVisible();
  await page.getByRole("button", { name: "Flip card" }).click();
  await expect(page.getByText("A DAG, topologically")).toBeVisible();
  await page.getByRole("tab", { name: "Smart Learn" }).click();
  await page.getByRole("button", { name: "Show answer" }).click();
  await page.getByRole("button", { name: /^Good/ }).click();
  await expect(page.getByText("All caught up")).toBeVisible();
});

test("tape hides notes and a tap reveals them; ruler and layers open", async ({ page }) => {
  await newNotebook(page);
  await page.locator("[data-testid=ink-surface][data-loaded]").first().waitFor();
  await page.getByRole("button", { name: "Tape", exact: true }).click();
  const surface = page.locator("[data-testid=ink-surface]").first();
  const b = (await surface.boundingBox())!;
  await page.mouse.move(b.x + 100, b.y + 200);
  await page.mouse.down();
  await page.mouse.move(b.x + 300, b.y + 205, { steps: 6 });
  await page.mouse.up();
  const tape = page.locator(".tape").first();
  await expect(tape).toBeVisible();
  await expect(tape).toHaveAttribute("aria-pressed", "false");
  await tape.click();
  await expect(tape).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Ruler" }).click();
  await expect(page.getByTestId("ruler")).toBeVisible();
  await page.getByRole("button", { name: "Hide ruler" }).click();
  await expect(page.getByTestId("ruler")).toHaveCount(0);

  await page.getByRole("button", { name: "Page options 1" }).click();
  await page.getByRole("menuitem", { name: "Layers..." }).click();
  await page.getByRole("button", { name: "Add layer" }).click();
  await expect(page.getByRole("textbox", { name: "Layer name" })).toHaveCount(2);
  await page.getByRole("button", { name: "Hide Layer 1" }).click();
  await expect.poll(async () => JSON.stringify(await rows(page, "pages"))).toContain("\"visible\":false");
});
