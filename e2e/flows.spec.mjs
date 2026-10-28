import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const errorsOf = (page) => {
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
};

async function typeCode(page, code) {
  const ed = page.locator('.cm-content').first();
  await ed.click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await page.keyboard.press('Backspace');
  // insertText keeps CodeMirror from auto-indenting what we paste
  await page.keyboard.insertText(code);
}

test('studio runs code as you type, explains errors, and counts characters @phone', async ({ page }) => {
  const errors = errorsOf(page);
  await page.goto('/studio');
  await typeCode(page, 'paper ink\nevery frame\n  dot 10, 20');
  await expect(page.locator('#problem')).toContainText('dot needs 3 numbers: x, y, size (got 2)');
  await expect(page.locator('#problem')).toContainText('line 3, col 3');
  await expect(page.locator('.cm-lintRange-error')).toHaveCount(1);
  await page.keyboard.insertText(', 30, ember');
  await expect(page.locator('#problem')).toBeHidden();
  await expect(page.locator('#meter-n')).toHaveText('45');
  await expect(page.locator('#stamp')).toBeVisible();
  expect(errors).toEqual([]);
});

test('runaway loops stop with a clear note', async ({ page }) => {
  await page.goto('/studio');
  await typeCode(page, 'every frame\n  repeat 100000000\n    x = 1');
  await expect(page.locator('#problem')).toContainText('this frame took more than 250,000 steps');
  await expect(page.locator('#problem')).toContainText('line 2');
});

test('share links carry the code', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/studio');
  const code = 'paper night\nevery frame\n  ring 0, 0, 100 + sin(t) * 50, ochre';
  await typeCode(page, code);
  await page.click('#link');
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('/studio?c=');
  const url = await page.evaluate(() => navigator.clipboard.readText());
  expect(url).toMatch(/\/studio\?c=[A-Za-z0-9_-]+$/);
  const other = await context.newPage();
  await other.goto(url.replace(/^https?:\/\/[^/]+/, ''));
  await expect(other.locator('.cm-content')).toContainText('ring 0, 0, 100 + sin(t) * 50, ochre');
  const html = await (await page.request.get(url.replace(/^https?:\/\/[^/]+/, ''))).text();
  expect(html).toMatch(/og:image" content="[^"]*\/og\/c\/[A-Za-z0-9_-]+\.png"/);
});

test('exports a PNG and a 6 second clip', async ({ page }) => {
  await page.goto('/studio?ex=orbit-garden');
  await expect(page.locator('#cost')).toContainText('steps');
  const [png] = await Promise.all([page.waitForEvent('download'), page.click('#png')]);
  expect(png.suggestedFilename()).toBe('orbit-garden.png');
  const pngBytes = readFileSync(await png.path());
  expect(pngBytes.subarray(1, 4).toString()).toBe('PNG');
  const [clip] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), page.click('#clip')]);
  expect(clip.suggestedFilename()).toMatch(/^orbit-garden\.(mp4|gif)$/);
  const clipBytes = readFileSync(await clip.path());
  expect(clipBytes.length).toBeGreaterThan(10_000);
});

test('pin, like and remix', async ({ page }) => {
  await page.goto('/studio');
  const code = `paper bone\nevery frame\n  repeat 7\n    ring 0, 0, ${20 + Math.floor(Math.random() * 1000)} / 10 + i * 30 + sin(t + i) * 9, sea`;
  await typeCode(page, code);
  await expect(page.locator('#problem')).toBeHidden();
  await page.click('#pin');
  await page.fill('#pin-title', 'e2e rings');
  await page.fill('#pin-handle', '@e2e_test');
  await page.click('#pin-go');
  await page.waitForURL(/\/p\/[a-z0-9]+$/, { timeout: 30_000 });
  await expect(page.locator('#title')).toHaveText('e2e rings');
  await expect(page.locator('#byline')).toContainText('@e2e_test');
  await expect(page.locator('.stamp').first()).toHaveText('fits in a post');
  const like = page.locator('#actions .like');
  await like.click();
  await expect(like).toHaveAttribute('aria-pressed', 'true');
  await expect(like).toContainText('1');
  const id = page.url().split('/').pop();
  const og = await page.request.get(`/og/p/${id}.png`);
  expect(og.headers()['content-type']).toBe('image/png');
  await page.click('#remix');
  await expect(page.locator('#remix-of')).toContainText('e2e rings');
  await expect(page.locator('.cm-content')).toContainText('sea');
  await page.goto('/wall');
  await expect(page.locator('.card').first()).toBeVisible();
});

test('learn: a goal is checked as you type @phone', async ({ page }) => {
  await page.goto('/learn#1');
  await expect(page.locator('#lesson-h')).toHaveText('A first dot');
  await expect(page.locator('#goal')).not.toHaveClass(/met/);
  await typeCode(page, 'dot 0, 0, 40\ndot 100, 100, 20\ndot -100, 100, 20');
  await expect(page.locator('#goal')).toHaveClass(/met/);
  await page.click('#next');
  await expect(page.locator('#lesson-h')).toHaveText('Paper and color');
  await expect(page.locator('#dots a').first()).toHaveClass(/done/);
});

test('all ten learn steps load and their starting code runs @phone', async ({ page }) => {
  const errors = errorsOf(page);
  for (let k = 1; k <= 10; k++) {
    await page.goto(`/learn#${k}`);
    await page.reload();
    await expect(page.locator('#lesson-n')).toHaveText(`step ${k} of 10`);
    await page.waitForTimeout(300);
    await expect(page.locator('#problem')).toBeHidden();
  }
  expect(errors).toEqual([]);
});

test('reference shows every entry with a live example', async ({ page }) => {
  const errors = errorsOf(page);
  await page.goto('/reference');
  expect(await page.locator('.ref-item').count()).toBeGreaterThan(50);
  expect(errors).toEqual([]);
});

test('night print theme sticks', async ({ page }) => {
  await page.goto('/');
  await page.click('.theme-toggle');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'night');
  await page.goto('/wall');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'night');
});
