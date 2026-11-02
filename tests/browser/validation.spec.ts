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

test('validation variants report issues without rendering invalid graphs', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await waitForRender(page);

  await page.getByRole('tab', { name: 'Validation' }).dispatchEvent('click');
  await expect(
    page.getByRole('heading', { name: 'Validation', level: 2 }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Preflight with validateGraph' }),
  ).toBeVisible();

  const variant = page.getByLabel('Variant');
  const summary = page.locator('.validation-summary');
  const issues = page.locator('.validation-issue');
  const codes = issues.locator('code');
  const chart = page.getByRole('group', { name: 'Validation diagram' });
  const expectValidChart = async () => {
    await expect(chart).toBeVisible();
    await expect(chart.locator('[data-kind="node"]')).toHaveCount(2);
    await expect(chart.locator('[data-kind="link"]')).toHaveCount(1);
    await expect(chart.locator('[data-key="allocation"]')).toBeVisible();
  };

  await expect(variant).toHaveValue('valid');
  await expect(summary).toContainText('Valid graph:');
  await expect(summary).toContainText('no issues');
  await expect(issues).toHaveCount(0);
  await expectValidChart();

  await variant.selectOption('cycle');
  await expect(summary).toContainText('Directed cycle:');
  await expect(
    codes.filter({ hasText: /^backward-stage-link$/ }),
  ).not.toHaveCount(0);
  await expect(codes.filter({ hasText: /^cycle$/ })).not.toHaveCount(0);
  await expectValidChart();

  await variant.selectOption('unknown-endpoint');
  await expect(summary).toContainText('Unknown endpoint:');
  await expect(codes.filter({ hasText: /^unknown-endpoint$/ })).not.toHaveCount(
    0,
  );
  await expect(issues.filter({ hasText: 'missing-target' })).toBeVisible();
  await expectValidChart();

  await variant.selectOption('total-too-small');
  await expect(summary).toContainText('Total too small:');
  await expect(codes.filter({ hasText: /^total-too-small$/ })).not.toHaveCount(
    0,
  );
  await expectValidChart();

  expect(errors).toEqual([]);
});
