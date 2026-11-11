import { test, expect } from "@playwright/test";
import { newNotebook } from "./helpers";

// After the tiptap 2 -> 3 upgrade (security review #1): the editor no longer re-renders on every keystroke,
// so check in a real browser that the toolbar still follows the cursor and that tables and checklists work.
test("text page: bold state, checklist, and table tools follow the cursor", async ({ page }) => {
  test.setTimeout(60_000);
  await newNotebook(page);
  await page.getByRole("button", { name: "Insert page at 2" }).click();
  await page.getByRole("menuitem", { name: "Text page" }).click();
  const editor = page.locator(".text-doc");
  await editor.click();

  const bold = page.getByRole("button", { name: "Bold", exact: true });
  await bold.click();
  await page.keyboard.type("Heavy");
  await expect(editor.locator("strong")).toHaveText("Heavy");
  await expect(bold).toHaveAttribute("aria-pressed", "true");
  await bold.click();
  await page.keyboard.press("Enter");
  await page.keyboard.type("plain");
  await expect(bold).toHaveAttribute("aria-pressed", "false");

  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Checklist" }).click();
  await page.keyboard.type("buy ink");
  await expect(editor.locator('ul[data-type="taskList"] li')).toContainText("buy ink");

  const addRow = page.getByRole("button", { name: "Add row" });
  await expect(addRow).toHaveCount(0);
  await page.getByRole("button", { name: "Insert table" }).click();
  await expect(editor.locator("table")).toHaveCount(1);
  await expect(addRow).toBeVisible();
  await addRow.click();
  await expect(editor.locator("table tr")).toHaveCount(4);

  // leave the table (to the top of the page): its tools go away without any other change to the page
  await page.keyboard.press("Control+Home");
  await expect(addRow).toHaveCount(0);
});
