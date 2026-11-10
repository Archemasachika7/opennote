import { expect, test } from "@playwright/test";

test("optional sign-in sheet validates email and closing keeps the app usable signed out", async ({ page }) => {
  // nothing may reach Supabase from this test (no real emails)
  const calls: string[] = [];
  await page.route("**/*.supabase.co/**", (route) => { calls.push(route.request().url()); return route.abort(); });

  await page.goto("/#/library");
  await page.getByRole("button", { name: "Account" }).click();
  const sheet = page.getByRole("dialog", { name: "Account" });
  await expect(sheet.getByText(/your notes stay on this device/i)).toBeVisible();

  const send = sheet.getByRole("button", { name: /send code/i });
  await expect(send).toBeDisabled();
  await sheet.getByLabel("Email").fill("not-an-email");
  await expect(send).toBeDisabled();
  await sheet.getByLabel("Email").fill("student@example.com");
  await expect(send).toBeEnabled();

  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();

  await page.getByRole("button", { name: /new notebook/i }).click();
  await expect(page).toHaveURL(/#\/nb\//);
  expect(calls).toEqual([]);
});
