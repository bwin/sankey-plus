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

async function openLinkedTableExample(page: Page) {
  await page.goto('/');
  await waitForRender(page);
  await page.getByRole('tab', { name: 'Linked table' }).click();
  await expect(
    page.getByRole('heading', { name: 'Linked table' }),
  ).toBeVisible();
  await expect(page.locator('[data-linked-table]')).toBeVisible();
  await expect(page.locator('[data-linked-row]')).toHaveCount(21);
  await expect(page.locator('[data-flow-subject]').first()).toBeVisible({
    timeout: 15_000,
  });
}

const subject = (page: Page, kind: 'node' | 'link', key: string) =>
  page.locator(`[data-flow-subject][data-kind="${kind}"][data-key="${key}"]`);

const linkedRow = (page: Page, kind: 'node' | 'link', key: string) =>
  page.locator(
    `[data-linked-row][data-linked-kind="${kind}"][data-linked-key="${key}"]`,
  );

test('table hover and focus emphasize one hop without inspecting or selecting', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openLinkedTableExample(page);

  await expect(page.locator('[data-emphasis="faded"]')).toHaveCount(0);
  await expect(page.locator('[data-flow-subject][tabindex="0"]')).toHaveCount(
    1,
  );

  const processA = linkedRow(page, 'node', 'process-a');
  await processA.hover();
  await expect(processA).toHaveAttribute('data-linked-active', 'true');
  await expect(processA).toHaveAttribute('data-table-active', 'true');
  await expect(processA).toHaveAttribute('data-chart-active', 'false');

  for (const key of [
    'input-a',
    'input-b',
    'supplement',
    'process-a',
    'result-a',
    'result-b',
    'deferred',
  ])
    await expect(subject(page, 'node', key)).toHaveAttribute(
      'data-emphasis',
      'strong',
    );
  for (const key of [
    'supplement-a',
    'input-a-process-a',
    'input-b-process-a',
    'process-a-result-a',
    'process-a-result-b',
    'process-a-deferred',
  ])
    await expect(subject(page, 'link', key)).toHaveAttribute(
      'data-emphasis',
      'strong',
    );
  await expect(subject(page, 'node', 'process-b')).toHaveAttribute(
    'data-emphasis',
    'faded',
  );
  await expect(page.getByRole('tooltip')).toBeHidden();
  await expect(page.locator('[data-selected="true"]')).toHaveCount(0);

  await page.mouse.move(4, 4);
  await expect(processA).toHaveAttribute('data-linked-active', 'false');
  await expect(page.locator('[data-emphasis="faded"]')).toHaveCount(0);

  const inputA = linkedRow(page, 'node', 'input-a');
  await expect(inputA).toHaveAttribute('tabindex', '0');
  await inputA.focus();
  await expect(inputA).toHaveAttribute('data-linked-active', 'true');
  for (const key of ['input-a', 'process-a', 'process-b', 'unused'])
    await expect(subject(page, 'node', key)).toHaveAttribute(
      'data-emphasis',
      'strong',
    );
  await expect(subject(page, 'node', 'result-a')).toHaveAttribute(
    'data-emphasis',
    'faded',
  );
  await expect(page.getByRole('tooltip')).toBeHidden();
  await expect(page.locator('[data-flow-subject][tabindex="0"]')).toHaveCount(
    1,
  );

  await page.keyboard.press('Escape');
  await expect(inputA).toHaveAttribute('data-linked-active', 'false');
  await expect(page.locator('[data-emphasis="faded"]')).toHaveCount(0);

  expect(errors).toEqual([]);
});

test('link rows emphasize their ribbon and chart inspection marks the row', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openLinkedTableExample(page);

  const resultLink = linkedRow(page, 'link', 'process-a-result-a');
  await resultLink.hover();
  await expect(resultLink).toHaveAttribute('data-linked-active', 'true');
  await expect(subject(page, 'link', 'process-a-result-a')).toHaveAttribute(
    'data-emphasis',
    'strong',
  );
  await expect(subject(page, 'node', 'process-a')).toHaveAttribute(
    'data-emphasis',
    'strong',
  );
  await expect(subject(page, 'node', 'result-a')).toHaveAttribute(
    'data-emphasis',
    'strong',
  );
  await expect(subject(page, 'node', 'process-b')).toHaveAttribute(
    'data-emphasis',
    'faded',
  );

  await page.mouse.move(4, 4);
  await expect(resultLink).toHaveAttribute('data-linked-active', 'false');

  const chartNode = subject(page, 'node', 'process-b');
  await chartNode.evaluate((element) =>
    element.scrollIntoView({ block: 'center', inline: 'center' }),
  );
  await expect(chartNode).toBeInViewport({ ratio: 1 });
  const box = await chartNode.boundingBox();
  if (!box) throw new Error('Node has no layout box.');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

  const processB = linkedRow(page, 'node', 'process-b');
  await expect(processB).toHaveAttribute('data-chart-active', 'true');
  await expect(processB).toHaveAttribute('data-linked-active', 'true');
  await expect(processB).toHaveAttribute('data-table-active', 'false');
  await expect(page.locator('[data-linked-chart-state]')).toHaveAttribute(
    'data-linked-chart-state',
    'process-b',
  );
  await expect(page.locator('[data-linked-table-state]')).toHaveAttribute(
    'data-linked-table-state',
    '',
  );
  await expect(page.locator('[data-linked-active="true"]')).toHaveCount(1);
  await expect(page.locator('[data-flow-subject][tabindex="0"]')).toHaveCount(
    1,
  );

  expect(errors).toEqual([]);
});

test('table hover does not change the controlled selection', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openLinkedTableExample(page);

  await page
    .getByLabel('External selection')
    .selectOption(JSON.stringify({ kind: 'node', key: 'result-a' }));
  const selected = subject(page, 'node', 'result-a');
  await expect(selected).toHaveAttribute('data-selected', 'true');

  const processA = linkedRow(page, 'node', 'process-a');
  await processA.hover();
  await expect(processA).toHaveAttribute('data-linked-active', 'true');
  await expect(selected).toHaveAttribute('data-selected', 'true');
  await expect(page.locator('[data-selected="true"]')).toHaveCount(1);
  await expect(page.locator('[data-linked-active="true"]')).toHaveCount(1);

  expect(errors).toEqual([]);
});
