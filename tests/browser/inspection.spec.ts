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

test('programmatic clicks only inspect through a subject control', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await waitForRender(page);

  const subject = page.locator('[data-flow-subject][data-kind="node"]').first();
  await expect(subject).toBeVisible({ timeout: 15_000 });
  await subject.evaluate((el) =>
    el.scrollIntoView({ block: 'center', inline: 'center' }),
  );
  await expect(subject).toBeInViewport({ ratio: 1 });
  const box = await subject.boundingBox();
  if (!box) throw new Error('Subject has no layout box.');
  const click = {
    detail: 0,
    button: 0,
    clientX: box.x + box.width / 2,
    clientY: box.y + box.height / 2,
  };

  // The target is the SVG background even though the coordinates point at the
  // subject, so detail-zero clicks must not use those coordinates for locating.
  const canvas = page.locator('svg.flow-canvas[role="group"]');
  await canvas.dispatchEvent('click', click);
  await expect(page.getByRole('tooltip')).toBeHidden();
  await expect(page.locator('[data-emphasis="faded"]')).toHaveCount(0);

  // Assistive activation dispatches detail-zero clicks on the subject control.
  await subject.dispatchEvent('click', click);
  await expect(page.getByRole('tooltip')).toBeVisible();

  expect(errors).toEqual([]);
});

test('pointer inspection opens the details', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await waitForRender(page);

  const node = page.locator('[data-flow-subject][data-kind="node"]').first();
  await expect(node).toBeVisible({ timeout: 15_000 });
  // Center the node instead of using scrollIntoViewIfNeeded, which can leave
  // part of it below the viewport and make the mouse move miss.
  await node.evaluate((el) =>
    el.scrollIntoView({ block: 'center', inline: 'center' }),
  );
  await expect(node).toBeInViewport({ ratio: 1 });
  const box = await node.boundingBox();
  if (!box) throw new Error('Node has no layout box.');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByRole('tooltip')).toBeVisible();

  expect(errors).toEqual([]);
});
