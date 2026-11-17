import { test, expect } from "@playwright/test";

test("new wallet flow, faraid and phone navigation remain usable without signing", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("wallet");
  await expect(page.locator("#splash")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: /Make room for the people/ }),
  ).toBeVisible();
  await page.screenshot({
    path: "../work/release/wallet-empty-desktop.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Set up my wallet" }).click();
  await expect(
    page.getByRole("heading", { name: "Set up your Pusaka wallet" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Faraid", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Spouse", exact: true })
    .selectOption("wife");
  await page.getByLabel("sons", { exact: true }).fill("1");
  await expect(page.getByRole("textbox", { name: "Name" }).first()).toHaveValue(
    "Wife",
  );
  await page.screenshot({
    path: "../work/release/setup-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "People who can look out for you" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Connect wallet", exact: true }).last(),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("wallet");
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await expect(
    page.getByRole("navigation", { name: "Wallet navigation" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Inheritance", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Inheritance", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "../work/release/wallet-empty-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("real public Chipnet plan restores and exposes chain status without fixture keys", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("wallet/demo");
  await expect(page.locator("#splash")).toHaveCount(0);
  await expect(
    page.getByRole("note").filter({ hasText: "Live Chipnet proof wallet" }),
  ).toBeVisible();
  await expect(
    page.getByText("Protected BCH balance", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".pw-balance-number")).not.toContainText("—", {
    timeout: 55000,
  });
  await expect(page.locator(".pw-error")).toHaveCount(0);
  await page.screenshot({
    path: "../work/release/wallet-live-desktop.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Inheritance", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your heirs", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Trusted contacts", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "../work/release/inheritance-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "../work/release/inheritance-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await page.getByRole("link", { name: "Swap", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Swap", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Get quote", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Get quote", exact: true }).click();
  await expect(page.getByText("Minimum return", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review swap", exact: true }),
  ).toBeDisabled();
  expect(errors).toEqual([]);
});
