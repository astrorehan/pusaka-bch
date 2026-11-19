import { test, expect } from "@playwright/test";
import { encodeCashAddress } from "@bitauth/libauth";
import { readFileSync } from "node:fs";

function address(seed: number) {
  return encodeCashAddress({
    prefix: "bchtest",
    payload: new Uint8Array(20).fill(seed),
    type: "p2pkh",
  }).address;
}

test("new wallet flow validates heirs and contacts before review", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("wallet");
  await expect(page.locator("#splash")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Create your protected wallet" }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("wallet-empty-desktop.png"),
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
  await page.getByLabel("Sons", { exact: true }).fill("1");
  await expect(page.getByRole("textbox", { name: "Name" }).first()).toHaveValue(
    "Wife",
  );
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("BCH address for Wife");
  const heirs = page.getByRole("textbox", { name: "BCH address", exact: true });
  await heirs.nth(0).fill(address(1));
  await heirs.nth(1).fill(address(2));
  await page.screenshot({
    path: testInfo.outputPath("setup-desktop.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "People who can look out for you" }),
  ).toBeVisible();
  await page.getByLabel("Trusted contact 1").fill(address(3));
  await page.getByLabel("Trusted contact 2").fill(address(3));
  await page.getByLabel("Trusted contact 3").fill(address(5));
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "three different trusted contact addresses",
  );
  await page.getByLabel("Trusted contact 2").fill(address(4));
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
    path: testInfo.outputPath("wallet-empty-mobile.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("real public Chipnet plan follows the demo between screens without replacing a saved wallet", async ({
  page,
}, testInfo) => {
  const fixture = readFileSync(new URL("../src/lib/protocol/demo-plan.json", import.meta.url));
  const { inboxAddress } = JSON.parse(fixture.toString("utf8"));
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("wallet/demo");
  await expect(page.locator("#splash")).toHaveCount(0);
  await expect(
    page.getByRole("note").filter({ hasText: "Live Chipnet proof wallet" }),
  ).toBeVisible();
  await expect(page.locator(".pw-balance-number")).toContainText(/\d/, {
    timeout: 30_000,
  });
  await expect(page.getByText("Protected BCH balance", { exact: true })).toBeVisible();
  await expect(page.locator(".pw-error")).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("wallet-live-desktop.png"),
    fullPage: true,
  });
  await page.evaluate(() => {
    navigator.clipboard.writeText = async (text) => { document.body.dataset.copiedAddress = text; };
  });
  const copy = page.getByRole("button", { name: "Copy BCH receive address" });
  await copy.click();
  await expect(copy.getByText("Copied", { exact: true }).first()).toBeVisible();
  await expect(page.locator("body")).toHaveAttribute("data-copied-address", inboxAddress);
  const receive = page.getByRole("button", { name: "Receive", exact: true });
  await receive.click();
  const receiveSheet = page.getByRole("dialog", { name: "Receive BCH" });
  await expect(
    receiveSheet.getByRole("button", { name: "Copy receive address" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(receiveSheet).toHaveCount(0);
  await expect(receive).toBeFocused();
  await page.getByRole("link", { name: "Inheritance", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your heirs", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Trusted contacts", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("inheritance-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("inheritance-mobile.png"),
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
  await page.screenshot({
    path: testInfo.outputPath("swap-mobile.png"),
    fullPage: true,
  });
  await page.goto("wallet");
  await expect(
    page.getByRole("heading", { name: "Create your protected wallet" }),
  ).toBeVisible();
  const shared = fixture.toString("base64url");
  await page.goto("./");
  await page.getByRole("button", { name: "Open a plan link", exact: true }).click();
  const opener = page.getByRole("dialog", { name: "Open a plan link" });
  await opener.getByRole("textbox", { name: "Plan link", exact: true }).fill(`/v2/plan#${shared}`);
  await opener.getByRole("button", { name: "Open plan", exact: true }).click();
  await expect(page).toHaveURL(/\/v2\/plan#/);
  await expect(
    page.getByRole("heading", { name: "Your heirs", exact: true }),
  ).toBeVisible({ timeout: 20000 });
  await expect(
    page.getByRole("heading", { name: "Share & recovery" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("the workspace folds on desktop, opens a drawer on tablet, and keeps the landing shell separate", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("wallet/activity");
  await expect(
    page.getByRole("link", { name: "Activity", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await page.getByRole("button", { name: "Fold sidebar" }).click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Expand sidebar" }),
  ).toBeVisible();

  await page.setViewportSize({ width: 900, height: 900 });
  await page.getByRole("button", { name: "Expand sidebar" }).click();
  const drawer = page.getByRole("dialog", { name: "Workspace navigation" });
  await expect(drawer).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Expand sidebar" }),
  ).toBeFocused();

  await page.setViewportSize({ width: 320, height: 750 });
  await expect(page.locator(".pw-app")).toHaveAttribute("data-wallet-theme", "dark");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await drawer.getByRole("button", { name: "Switch to light theme" }).click();
  await page.reload();
  await expect(page.locator(".pw-app")).toHaveAttribute("data-wallet-theme", "light");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await drawer.getByRole("button", { name: "Switch to dark theme" }).click();
  await expect(page.locator(".pw-app")).toHaveAttribute("data-wallet-theme", "dark");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Open a plan", exact: true }).click();
  const plan = page.getByRole("dialog", { name: "Open a saved plan" });
  await expect(plan).toBeVisible();
  await plan
    .getByRole("textbox", { name: "Plan link or JSON" })
    .fill("invalid link");
  await plan.getByRole("button", { name: "Open plan", exact: true }).click();
  await expect(plan.getByRole("alert")).toContainText(
    "Paste the complete plan link",
  );
  await page.screenshot({
    path: testInfo.outputPath("open-plan-mobile-dark.png"),
  });
  await plan.getByRole("link", { name: "Open a legacy plan" }).click();
  await expect(page.getByRole("main")).toHaveAttribute("id", "wallet-main");
  await expect(
    page.getByRole("heading", { name: "Open a plan link" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.goto("./");
  await expect(page.locator(".shell--home")).toBeVisible();
  await expect(page.locator(".pw-app")).toHaveCount(0);
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", "dark");
});

test("invalid saved plan data and failed copies have recoverable messages", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    localStorage.setItem("pusaka.v2.plans.chipnet", "{}");
    localStorage.setItem("pusaka.v2.activity.chipnet", "[null,{}]");
    navigator.clipboard.writeText = async () => { throw new Error("Clipboard unavailable"); };
    document.execCommand = () => false;
  });
  await page.goto("wallet");
  await expect(page.getByRole("heading", { name: "Create your protected wallet" })).toBeVisible();
  const copy = page.getByRole("button", { name: "Copy donation address (accepts CashTokens)" });
  await copy.click();
  await expect(copy).toHaveAttribute("title", "Could not copy");
  await expect(copy).toBeFocused();

  await page.getByRole("button", { name: "Open a plan", exact: true }).click();
  const opener = page.getByRole("dialog", { name: "Open a saved plan" });
  await opener.getByLabel("Or choose saved plan data").setInputFiles({
    name: "large-plan.json",
    mimeType: "application/json",
    buffer: Buffer.alloc(1_000_001),
  });
  await expect(opener.getByRole("alert")).toContainText("too large");

  const saved = JSON.parse(readFileSync(new URL("../src/lib/protocol/demo-plan.json", import.meta.url), "utf8"));
  await opener.getByRole("textbox").fill(JSON.stringify({ ...saved, network: "mainnet" }));
  await opener.getByRole("button", { name: "Open plan", exact: true }).click();
  await expect(opener.getByRole("alert")).toContainText("This site uses the test network");
  await opener.getByRole("textbox").fill(JSON.stringify({ ...saved, heirs: null }));
  await opener.getByRole("button", { name: "Open plan", exact: true }).click();
  await expect(opener.getByRole("alert")).toContainText("Paste the complete plan link");
  await expect(page).toHaveURL(/\/wallet$/);
});

test("wallet pairing opens an accessible QR and wallet link under the production policy", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("Content Security Policy")) violations.push(message.text());
  });
  await page.setViewportSize({ width: 320, height: 750 });
  await page.goto("wallet");
  await page.getByRole("button", { name: "Connect wallet", exact: true }).click();
  const pairing = page.getByRole("dialog", { name: "Connect your wallet" });
  await expect(pairing.getByRole("img", { name: "Wallet connection QR code" })).toBeVisible();
  await expect(pairing.getByRole("link", { name: "Open in wallet" })).toHaveAttribute("href", /^wiz:\/\//);
  await page.keyboard.press("Escape");
  await expect(pairing).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Connect wallet", exact: true })).toBeEnabled();
  expect(violations).toEqual([]);

  const inlineScriptRan = await page.evaluate(() => {
    const script = document.createElement("script");
    script.textContent = "document.documentElement.dataset.policyProbe = 'ran'";
    document.head.append(script);
    script.remove();
    return document.documentElement.dataset.policyProbe === "ran";
  });
  expect(inlineScriptRan).toBe(false);
});
