import { test, expect } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { writeFileSync, mkdirSync } from "node:fs";

async function makePdf(path: string) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage([612, 792]).drawText("Photosynthesis basics", { x: 72, y: 700, size: 24, font });
  doc.addPage([792, 612]).drawText("Light reactions", { x: 72, y: 500, size: 24, font });
  mkdirSync("test-results", { recursive: true });
  writeFileSync(path, await doc.save());
}

test("import a PDF as a notebook, annotate it, and find its text", async ({ page }) => {
  test.setTimeout(60_000);
  const pdfPath = "test-results/sample.pdf";
  await makePdf(pdfPath);
  await page.goto("/#/library");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Import" }).click();
  await (await chooser).setFiles(pdfPath);
  await expect(page.getByText('Imported "sample"')).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Open sample" }).click();
  await expect(page.getByTestId("thumb")).toHaveCount(2);
  await expect(page.getByTestId("pdf-background").first()).toBeVisible();
  // second page is landscape: wider than tall
  const second = page.locator("section.page-wrap").nth(1).locator(".paper");
  await second.scrollIntoViewIfNeeded();
  const box = await second.boundingBox();
  expect(box!.width).toBeGreaterThan(box!.height);
  // annotate over the PDF with the pen
  const surf = page.locator("[data-testid=ink-surface][data-loaded]").first();
  const b = await surf.boundingBox();
  await page.mouse.move(b!.x + 100, b!.y + 100); await page.mouse.down();
  for (let i = 0; i < 10; i++) await page.mouse.move(b!.x + 100 + i * 15, b!.y + 110);
  await page.mouse.up();
  await page.getByRole("button", { name: "Back to library" }).click();
  await page.getByRole("searchbox").fill("light reactions");
  await expect(page.getByText(/Light reactions/)).toBeVisible();
});
