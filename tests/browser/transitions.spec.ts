import { expect, test, type Page } from '@playwright/test';

const ghostSelector = '.flow-canvas--ghost';
const liveSelector = 'svg.flow-canvas:not(.flow-canvas--ghost)';

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

test('scene transitions crossfade and respect reduced motion', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await waitForRender(page);

  await page.getByRole('tab', { name: 'Transitions' }).dispatchEvent('click');
  await expect(
    page.getByRole('heading', { name: 'Transitions' }),
  ).toBeVisible();
  const liveLink = page.locator(`${liveSelector} .flow-link-label`);
  await expect(liveLink).toHaveText('500 units', { timeout: 15_000 });

  const swap = page.getByRole('button', { name: 'Swap data' });
  await swap.click();

  const ghost = page.locator(ghostSelector);
  await expect(ghost).toHaveCount(1);
  await expect(ghost).toHaveAttribute('aria-hidden', 'true');
  await expect(ghost).toHaveCSS('pointer-events', 'none');
  await expect(ghost.locator('[tabindex]')).toHaveCount(0);
  await expect(ghost.locator('.flow-link-label')).toHaveText('500 units');
  await expect(liveLink).toHaveText('750 units', { timeout: 15_000 });
  await expect(ghost).toHaveCount(0, { timeout: 5_000 });

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await swap.click();
  await expect(liveLink).toHaveText('500 units', { timeout: 15_000 });
  await expect(page.locator(ghostSelector)).toHaveCount(0);
  await page.waitForTimeout(400);
  await expect(page.locator(ghostSelector)).toHaveCount(0);

  expect(errors).toEqual([]);
});
