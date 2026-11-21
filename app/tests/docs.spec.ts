import { expect, test } from '@playwright/test';

test('the app links to the docs and the wallet guide opens by URL', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('link', { name: 'Docs' }).click();
  await expect(page.getByRole('heading', { name: 'Pusaka docs' })).toBeVisible();

  await page.getByRole('main').getByRole('link', { name: /Wallet guide/ }).click();
  await expect(page).toHaveURL(/\/docs\/wallet-guide\/$/);
  expect((await page.reload())?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Pusaka wallet guide' })).toBeVisible();
  await page.getByRole('navigation', { name: 'On this page' }).getByRole('link', { name: 'Family' }).click();
  await expect(page).toHaveURL(/#family$/);
});

test('a docs article is readable on a small screen with JavaScript disabled', async ({ browser, baseURL }) => {
  const page = await browser.newPage({ baseURL, javaScriptEnabled: false, viewport: { width: 320, height: 720 } });
  try {
    const response = await page.goto('docs/judge-guide/#current-limits');
    expect(response?.status()).toBe(200);
    await expect(page.locator('#current-limits')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
    await page.getByText('Browse docs', { exact: true }).click();
    await expect(page.getByRole('navigation', { name: 'Documentation' }).getByRole('link', { name: 'On-chain record' })).toBeVisible();
  } finally {
    await page.close();
  }
});

test('docs search opens from the keyboard and links to a matching section', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('docs/');
  await expect(page.getByRole('button', { name: 'Search docs' })).toBeVisible();
  await page.getByRole('button', { name: 'Dark theme' }).click();
  await page.keyboard.press('Control+k');

  const search = page.getByRole('dialog', { name: 'Search documentation' });
  const input = search.getByRole('searchbox');
  await expect(input).toBeFocused();
  await input.fill('current limits');
  const match = search.getByRole('link').first();
  await expect(match).toHaveAttribute('href', /\/docs\/judge-guide\/#current-limits$/);
  await input.press('ArrowDown');
  await expect(match).toBeFocused();
  await match.press('ArrowUp');
  await expect(input).toBeFocused();
  await input.press('Enter');

  await expect(page).toHaveURL(/\/docs\/judge-guide\/#current-limits$/);
  await expect(page.getByRole('heading', { name: 'Current limits', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});
