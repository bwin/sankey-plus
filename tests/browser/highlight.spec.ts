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

async function openInspectionExample(page: Page) {
  await page.goto('/');
  await waitForRender(page);
  await page.getByRole('tab', { name: 'Inspection bridge' }).click();
  await expect(
    page.getByRole('heading', { name: 'Inspection bridge' }),
  ).toBeVisible();
  await expect(page.locator('[data-flow-subject]').first()).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.locator('[data-inspection-result]')).toHaveText('none');
}

const subject = (page: Page, kind: 'node' | 'link', key: string) =>
  page.locator(`[data-flow-subject][data-kind="${kind}"][data-key="${key}"]`);

test('external highlight emphasizes one hop without adding tab stops', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openInspectionExample(page);

  await expect(page.locator('[data-emphasis="faded"]')).toHaveCount(0);
  await expect(page.locator('[data-flow-subject][tabindex="0"]')).toHaveCount(
    1,
  );

  await page.getByLabel('External highlight').selectOption('process-a');

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
  await expect(subject(page, 'node', 'unused')).toHaveAttribute(
    'data-emphasis',
    'faded',
  );
  await expect(subject(page, 'link', 'input-a-process-b')).toHaveAttribute(
    'data-emphasis',
    'faded',
  );
  await expect(page.locator('[data-emphasis="faded"]')).toHaveCount(8);
  await expect(page.locator('[data-inspection-result]')).toHaveText('none');
  await expect(page.locator('[data-flow-subject][tabindex="0"]')).toHaveCount(
    1,
  );

  expect(errors).toEqual([]);
});

test('inspection callback reports keyboard, pointer and dismissal', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openInspectionExample(page);
  await page.getByLabel('External highlight').selectOption('process-a');

  const inputA = subject(page, 'node', 'input-a');
  await inputA.focus();
  await expect(page.locator('[data-inspection-result]')).toHaveText(
    'node:input-a · keyboard',
  );
  await expect(page.getByRole('tooltip')).toBeVisible();

  const processB = subject(page, 'node', 'process-b');
  await processB.evaluate((el) =>
    el.scrollIntoView({ block: 'center', inline: 'center' }),
  );
  await expect(processB).toBeInViewport({ ratio: 1 });
  const box = await processB.boundingBox();
  if (!box) throw new Error('Node has no layout box.');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('[data-inspection-result]')).toHaveText(
    'node:process-b · pointer',
  );

  await page.keyboard.press('Escape');
  await expect(page.locator('[data-inspection-result]')).toHaveText('none');
  await expect(page.getByRole('tooltip')).toBeHidden();

  expect(errors).toEqual([]);
});

test('controlled selection remains independent of external highlight', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openInspectionExample(page);
  await page.getByLabel('External highlight').selectOption('process-a');

  await page
    .getByLabel('External selection')
    .selectOption(JSON.stringify({ kind: 'link', key: 'input-a-process-b' }));

  const selected = subject(page, 'link', 'input-a-process-b');
  await expect(selected).toHaveAttribute('data-selected', 'true');
  await expect(selected).toHaveAttribute('data-emphasis', 'faded');
  await expect(subject(page, 'node', 'process-a')).toHaveAttribute(
    'data-emphasis',
    'strong',
  );
  await expect(page.locator('[data-inspection-result]')).toHaveText('none');
  await expect(page.locator('[data-selected="true"]')).toHaveCount(1);

  await page.getByLabel('External highlight').selectOption('');
  await expect(page.locator('[data-emphasis="faded"]')).toHaveCount(0);
  await expect(selected).toHaveAttribute('data-selected', 'true');
  await expect(page.locator('[data-selected="true"]')).toHaveCount(1);
  await expect(page.locator('[data-flow-subject][tabindex="0"]')).toHaveCount(
    1,
  );

  expect(errors).toEqual([]);
});
