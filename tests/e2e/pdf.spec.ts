import { test, expect } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { readFileSync } from "node:fs";
import { addLivePage, newNotebook } from "./helpers";

test("export a notebook with ink, text and a live page to PDF", async ({ page }) => {
  test.setTimeout(60_000);
  await newNotebook(page);
  await page.getByRole("button", { name: "Insert page at 2" }).click();
  await page.getByRole("menuitem", { name: "Text page" }).click();
  await page.locator(".text-doc").click();
  await page.keyboard.type("Exported notes");
  await addLivePage(page, "<!DOCTYPE html><html><head><title>Chart</title></head><body><h1 style='color:#7c5cff'>Bar chart</h1></body></html>", 3);
  await expect(page.frameLocator("iframe[title=Chart]").locator("h1")).toHaveText("Bar chart");

  await page.getByRole("button", { name: "Notebook options" }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 40_000 }),
    page.getByRole("menuitem", { name: "Export PDF" }).click(),
  ]);
  await expect(page.getByText("PDF saved (3 pages)")).toBeVisible();
  await expect(page.getByText(/shown as a card/)).toHaveCount(0);
  expect(download.suggestedFilename()).toBe("Untitled notebook.pdf");
  const bytes = readFileSync(await download.path());
  expect(new TextDecoder().decode(bytes.subarray(0, 5))).toBe("%PDF-");
  const pdf = await PDFDocument.load(bytes);
  expect(pdf.getPageCount()).toBe(3);
});

test("export a single page as PDF from the page menu", async ({ page }) => {
  await newNotebook(page);
  await page.getByRole("button", { name: /page options 1/i }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("menuitem", { name: "Export page as PDF" }).click(),
  ]);
  const pdf = await PDFDocument.load(readFileSync(await download.path()));
  expect(pdf.getPageCount()).toBe(1);
});
