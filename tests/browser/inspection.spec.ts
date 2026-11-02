import { expect, test } from '@playwright/test';

test('changing graphs clears an active keyboard inspection', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');
  await expect(page.locator('[data-render-time]')).not.toContainText(
    'Rendering…',
    { timeout: 15_000 },
  );

  const subject = page.locator('[data-flow-subject]').first();
  await expect(subject).toBeVisible({ timeout: 15_000 });
  // Keep the pointer away from the diagram so a layout change cannot
  // immediately re-inspect a subject under a stationary cursor.
  await subject.focus();
  await expect(page.getByRole('tooltip')).toBeVisible();

  await page.getByRole('tab', { name: 'Stages' }).dispatchEvent('click');
  await expect(page.getByRole('heading', { name: 'Stages' })).toBeVisible();
  await expect(page.locator('[data-flow-subject]').first()).toBeVisible();
  await expect(page.getByRole('tooltip')).toBeHidden();

  // Returning to the first graph would reactivate a stale inspection if the
  // model-change effect had not cleared it.
  await page.getByRole('tab', { name: 'Distribution' }).dispatchEvent('click');
  await expect(
    page.getByRole('heading', { name: 'Distribution' }),
  ).toBeVisible();
  await expect(page.locator('[data-flow-subject]').first()).toBeVisible();
  await expect(page.getByRole('tooltip')).toBeHidden();

  expect(errors).toEqual([]);
});
