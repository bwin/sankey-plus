import { expect, test, type Page } from '@playwright/test';

async function waitForRender(page: Page) {
  await expect(page.locator('[data-render-time]')).not.toContainText(
    'Rendering…',
    { timeout: 15_000 },
  );
}

async function patternTrack(page: Page, dark = false) {
  return page.evaluate((useDark) => {
    const diagram = document.querySelector('.flow-diagram');
    if (useDark) diagram?.classList.add('distribution-dark');
    const track = document.querySelector('pattern rect');
    if (!track) return null;
    const value = getComputedStyle(track).fill;
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d');
    if (!context) return { value, channels: null };
    context.fillStyle = value;
    context.fillRect(0, 0, 1, 1);
    return {
      value,
      channels: [...context.getImageData(0, 0, 1, 1).data],
    };
  }, dark);
}

test('headroom hatch marks only partially allocated source capacity', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');
  await waitForRender(page);
  await page.getByRole('tab', { name: 'Headroom' }).dispatchEvent('click');
  await expect(page.getByRole('heading', { name: 'Headroom' })).toBeVisible();

  const available = page.locator('[data-headroom-node="available"]');
  await expect(available).toBeVisible({ timeout: 15_000 });
  await expect(
    page.locator('text.flow-label').filter({ hasText: '50% headroom' }),
  ).toBeVisible();
  await expect(page.locator('[data-headroom-node="allocated"]')).toHaveCount(0);
  await expect(available).toHaveAttribute('pointer-events', 'none');
  await expect(available).toHaveAttribute('aria-hidden', 'true');
  await expect(available).toHaveAttribute('fill', /^url\(#.+\)$/);

  const light = await patternTrack(page);
  expect(light).not.toBeNull();
  expect(light!.channels).not.toBeNull();
  expect(light!.channels![3]).toBeGreaterThan(0);

  const dark = await patternTrack(page, true);
  expect(dark).not.toBeNull();
  expect(dark!.channels).not.toBeNull();
  const [red, green, blue, alpha] = dark!.channels!;
  expect(alpha).toBeGreaterThan(0);
  expect((red + green + blue) / 3).toBeLessThan(160);
  expect(dark!.channels).not.toEqual(light!.channels);

  expect(errors).toEqual([]);
});
