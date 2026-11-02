import { expect, test, type Page } from '@playwright/test';

async function waitForRender(page: Page) {
  await expect(page.locator('[data-render-time]')).not.toContainText(
    'Rendering…',
    { timeout: 15_000 },
  );
}

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

test('layout overlay, diagnostics and SVG export', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await waitForRender(page);

  await page.getByRole('tab', { name: 'Layout overlay' }).click();
  await expect(
    page.getByRole('heading', { name: 'Layout overlay' }),
  ).toBeVisible();
  await waitForRender(page);

  const overlay = page.locator('.layout-annotations');
  await expect(overlay).toBeVisible({ timeout: 15_000 });
  await expect(overlay.locator('[data-layout-stage-heading]')).toHaveCount(3);
  await expect(
    overlay.locator('[data-layout-stage-heading="inputs"]'),
  ).toContainText('INPUTS');
  await expect(
    overlay.locator('[data-layout-stage-heading="processing"]'),
  ).toContainText('PROCESSING');
  await expect(
    overlay.locator('[data-layout-stage-heading="results"]'),
  ).toContainText('RESULTS');
  await expect(
    overlay.locator('[data-layout-callout="process-a"]'),
  ).toBeVisible();
  await expect(
    overlay.locator('[data-layout-callout="process-a"]'),
  ).toContainText('PROCESS A');

  const diagnostics = page.locator('[data-layout-diagnostics]');
  await expect(diagnostics).toBeVisible({ timeout: 15_000 });
  await expect(diagnostics).toContainText(/\d+ crossings/);
  await expect(diagnostics).toContainText(/\d+ obstacle collisions/);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download SVG' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.svg$/);

  expect(errors).toEqual([]);
});
