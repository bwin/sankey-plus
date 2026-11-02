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

test('changing graphs clears an active keyboard inspection', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await waitForRender(page);

  const subject = page.locator('[data-flow-subject]').first();
  await expect(subject).toBeVisible({ timeout: 15_000 });
  // Keep the pointer away from the diagram so a layout change cannot
  // immediately re-inspect a subject under a stationary cursor.
  await subject.focus();
  await expect(page.getByRole('tooltip')).toBeVisible();
  await expect(page.locator('[data-emphasis="faded"]')).not.toHaveCount(0);

  // Focus the tooltip so the diagram does not blur/clear the inspection
  // before the graph changes. This leaves the model-change effect as the
  // main cleanup path for the round trip below.
  await page.getByRole('tooltip').focus();

  await page.getByRole('tab', { name: 'Stages' }).dispatchEvent('click');
  await expect(page.getByRole('heading', { name: 'Stages' })).toBeVisible();
  await expect(page.locator('[data-flow-subject]').first()).toBeVisible();
  await expect(page.getByRole('tooltip')).toBeHidden();

  // Returning to the first graph would reactivate a stale inspection and
  // emphasis if the model-change effect had not cleared them.
  await page.getByRole('tab', { name: 'Distribution' }).dispatchEvent('click');
  await expect(
    page.getByRole('heading', { name: 'Distribution' }),
  ).toBeVisible();
  await expect(page.locator('[data-flow-subject]').first()).toBeVisible();
  await expect(page.getByRole('tooltip')).toBeHidden();
  await expect(page.locator('[data-emphasis="faded"]')).toHaveCount(0);

  expect(errors).toEqual([]);
});

test('pointer inspection opens the details', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await waitForRender(page);

  const node = page.locator('[data-flow-subject][data-kind="node"]').first();
  await expect(node).toBeVisible({ timeout: 15_000 });
  await node.scrollIntoViewIfNeeded();
  const box = await node.boundingBox();
  if (!box) throw new Error('Node has no layout box.');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByRole('tooltip')).toBeVisible();

  expect(errors).toEqual([]);
});
