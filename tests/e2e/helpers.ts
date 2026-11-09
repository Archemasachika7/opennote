import { expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

export const fixture = (name: string): string => readFileSync(`tests/e2e/fixtures/${name}`, "utf8");

export async function newNotebook(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: /new notebook/i }).click();
  await expect(page.locator("[data-testid=ink-surface]").first()).toBeVisible();
}

export async function addLivePage(page: Page, source: string, at = 2): Promise<void> {
  await page.getByRole("button", { name: `Insert page at ${at}` }).click();
  await page.getByRole("menuitem", { name: "Live page" }).click();
  await page.getByRole("textbox", { name: /artifact code/i }).fill(source);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
