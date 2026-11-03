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
  await expect(processA).toHaveAttribute('data-table-hover', 'true');
  await expect(processA).toHaveAttribute('data-table-focus', 'false');
  await expect(processA).toHaveAttribute('data-table-active', 'true');
  await expect(processA).toHaveAttribute('data-chart-active', 'false');
  await expect(processA).toHaveAttribute(
    'aria-label',
    'Node: Process A, processing, 900 units declared total',
  );

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
  await expect(inputA).toHaveAttribute('data-table-hover', 'false');
  await expect(inputA).toHaveAttribute('data-table-focus', 'true');
  await expect(inputA).toHaveAttribute(
    'aria-label',
    'Node: Input A, inputs, 1,000 units declared total',
  );
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
  const nodeBar = chartNode.locator('rect[data-node-paint]');
  const box = await nodeBar.boundingBox();
  if (!box) throw new Error('Node bar has no layout box.');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

  const processB = linkedRow(page, 'node', 'process-b');
  await expect(processB).toHaveAttribute('data-chart-active', 'true');
  await expect(processB).toHaveAttribute('data-linked-active', 'true');
  await expect(processB).toHaveAttribute('data-table-active', 'false');
  await expect(processB).toHaveAttribute(
    'aria-label',
    'Node: Process B, processing, 550 units derived total',
  );
  await expect(page.locator('[data-linked-chart-state]')).toHaveAttribute(
    'data-linked-chart-state',
    'process-b',
  );
  await expect(page.locator('[data-linked-table-state]')).toHaveAttribute(
    'data-linked-table-state',
    '',
  );
  await expect(page.locator('[data-linked-status]')).toHaveText(
    'Node inspected: Process B · pointer.',
  );
  await expect(page.locator('[data-linked-status]')).toHaveAttribute(
    'aria-live',
    'off',
  );
  await expect(page.locator('[data-linked-active="true"]')).toHaveCount(1);
  await expect(page.locator('[data-flow-subject][tabindex="0"]')).toHaveCount(
    1,
  );

  expect(errors).toEqual([]);
});

test('hover and focus restore independently and Escape dismisses both', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openLinkedTableExample(page);

  const processA = linkedRow(page, 'node', 'process-a');
  const processB = linkedRow(page, 'node', 'process-b');

  await page.mouse.move(4, 4);
  await processA.focus();
  await expect(processA).toHaveAttribute('data-table-focus', 'true');
  await expect(processA).toHaveAttribute('data-table-hover', 'false');
  await expect(processA).toHaveAttribute('data-table-active', 'true');
  await expect(subject(page, 'node', 'process-a')).toHaveAttribute(
    'data-emphasis',
    'strong',
  );

  await processB.hover();
  await expect(processB).toHaveAttribute('data-table-hover', 'true');
  await expect(processB).toHaveAttribute('data-table-focus', 'false');
  await expect(processB).toHaveAttribute('data-table-active', 'true');
  await expect(processA).toHaveAttribute('data-table-focus', 'true');
  await expect(processA).toHaveAttribute('data-table-active', 'false');
  await expect(subject(page, 'node', 'process-b')).toHaveAttribute(
    'data-emphasis',
    'strong',
  );
  await expect(subject(page, 'node', 'process-a')).toHaveAttribute(
    'data-emphasis',
    'faded',
  );

  await page.mouse.move(4, 4);
  await expect(processB).toHaveAttribute('data-table-hover', 'false');
  await expect(processB).toHaveAttribute('data-table-active', 'false');
  await expect(processA).toHaveAttribute('data-table-focus', 'true');
  await expect(processA).toHaveAttribute('data-table-active', 'true');
  await expect(subject(page, 'node', 'process-a')).toHaveAttribute(
    'data-emphasis',
    'strong',
  );
  await expect(subject(page, 'node', 'process-b')).toHaveAttribute(
    'data-emphasis',
    'faded',
  );

  await page.keyboard.press('Escape');
  await expect(processA).toHaveAttribute('data-table-focus', 'false');
  await expect(processA).toHaveAttribute('data-table-hover', 'false');
  await expect(processA).toHaveAttribute('data-table-active', 'false');
  await expect(page.locator('[data-emphasis="faded"]')).toHaveCount(0);

  await page.mouse.move(6, 6);
  await expect(processA).toHaveAttribute('data-table-active', 'false');

  expect(errors).toEqual([]);
});

test('keyboard inspection reveals a low link row and announces it', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openLinkedTableExample(page);
  const pageScroll = await page.evaluate(() => window.scrollY);

  const chartLink = subject(page, 'link', 'process-a-deferred');
  await chartLink.evaluate((element) => element.focus({ preventScroll: true }));

  const deferred = linkedRow(page, 'link', 'process-a-deferred');
  await expect(deferred).toHaveAttribute('data-chart-active', 'true');
  await expect(deferred).toHaveAttribute(
    'aria-label',
    'Link: Process A → Deferred, processing → Edge · bottom, 100 units input amount',
  );
  await expect(page.locator('[data-linked-status]')).toHaveText(
    'Link inspected: Process A → Deferred · keyboard.',
  );
  await expect(page.locator('[data-linked-status]')).toHaveAttribute(
    'aria-live',
    'polite',
  );

  await expect
    .poll(() =>
      page.evaluate(
        () => document.querySelector('.linked-table-scroll')!.scrollTop,
      ),
    )
    .toBeGreaterThan(0);
  const reveal = await page.evaluate(() => {
    const scroller = document.querySelector('.linked-table-scroll')!;
    const row = document.querySelector(
      '[data-linked-row][data-linked-kind="link"][data-linked-key="process-a-deferred"]',
    )!;
    const scrollerBox = scroller.getBoundingClientRect();
    const rowBox = row.getBoundingClientRect();
    return {
      scrollTop: scroller.scrollTop,
      visible:
        rowBox.top >= scrollerBox.top + 30 &&
        rowBox.bottom <= scrollerBox.bottom,
    };
  });
  expect(reveal.scrollTop).toBeGreaterThan(0);
  expect(reveal.visible).toBe(true);
  expect(await page.evaluate(() => window.scrollY)).toBe(pageScroll);

  await page.keyboard.press('Escape');
  await expect(page.locator('[data-linked-status]')).toHaveText(
    'No chart inspection.',
  );
  await expect(page.locator('[data-linked-status]')).toHaveAttribute(
    'aria-live',
    'polite',
  );
  await expect(deferred).toHaveAttribute('data-chart-active', 'false');

  expect(errors).toEqual([]);
});

test('narrow layout keeps the table scrollable in both axes', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 480, height: 900 });
  await openLinkedTableExample(page);

  const metrics = await page.locator('.linked-table-scroll').evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  }));
  expect(metrics.scrollWidth).toBeGreaterThan(metrics.clientWidth);
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);

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
