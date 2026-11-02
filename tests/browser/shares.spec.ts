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

test('link shares appear in labels and tooltips', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await waitForRender(page);

  await page.getByRole('tab', { name: 'Shares' }).dispatchEvent('click');
  await expect(page.getByRole('heading', { name: 'Shares' })).toBeVisible();
  await waitForRender(page);

  const sharedLabel = page
    .locator('.flow-link-label')
    .filter({ hasText: '% of source' })
    .first();
  await expect(sharedLabel).toBeVisible({ timeout: 15_000 });

  const link = page.locator(
    '[data-flow-subject][data-kind="link"][data-key="input-a-process-a"]',
  );
  await expect(link).toBeVisible({ timeout: 15_000 });
  await link.focus();

  const tooltip = page.getByRole('tooltip');
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText('% of source');
  await expect(tooltip).toContainText('% of target');

  expect(errors).toEqual([]);
});
