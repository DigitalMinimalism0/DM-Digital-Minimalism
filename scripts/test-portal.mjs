import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const root = resolve(import.meta.dirname, '..'),
  dir = join(root, '.e2e', 'portal');
mkdirSync(dir, { recursive: true });
const origin = 'http://127.0.0.1:4186';
const server = spawn(process.execPath, ['scripts/serve.mjs', 'dist', '4186'], {
  cwd: root,
  stdio: 'ignore',
  windowsHide: true,
});
let browser;
try {
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(origin)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await chromium.launch({
    channel: process.env.E2E_BROWSER ?? (process.platform === 'win32' ? 'msedge' : 'chromium'),
    headless: true,
    args: ['--enable-unsafe-swiftshader'],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'no-preference',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const settle = () =>
    page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
  const scroll = async (fraction) => {
    await page.evaluate(
      (f) =>
        window.scrollTo({
          top: (document.documentElement.scrollHeight - innerHeight) * f,
          behavior: 'instant',
        }),
      fraction,
    );
    await settle();
    if (await page.locator('#world[data-renderer="webgl"]').count())
      await page.waitForFunction(
        (f) => Math.abs(Number(document.getElementById('world-depth').dataset.progress) - f) < 0.01,
        fraction,
      );
  };
  await page.goto(origin);
  await page.waitForSelector('.portal-enabled');
  await page.evaluate(() => document.fonts.ready);
  await settle();
  let initial = await page.locator('.world-backdrop').boundingBox();
  const depth = await page.locator('#world[data-renderer="webgl"]').count();
  assert.ok(depth, 'the original ocean shader must render in the visual browser test');
  await page.waitForFunction(
    () => document.getElementById('world-depth').dataset.progress === '0.000',
  );
  assert.equal(
    await page.locator('body').evaluate((el) => getComputedStyle(el).fontFamily.split(',')[0]),
    '"Albert Sans"',
  );
  await page.screenshot({ path: join(dir, 'entrance.png') });
  await scroll(0.5);
  const middle = await page.locator('.world-backdrop').boundingBox();
  assert.ok(middle.width >= 1438);
  await page.screenshot({ path: join(dir, 'mid-scroll.png') });
  await scroll(1);
  await page.waitForSelector('#world.is-ready[data-view="offline"]');
  const readingSurface = await page.locator('#world-panel').evaluate((panel) => {
    const rgb = (value) =>
      value
        .match(/[\d.]+/g)
        .slice(0, 3)
        .map(Number);
    const luminance = (color) =>
      rgb(color)
        .map((n) => {
          const s = n / 255;
          return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        })
        .reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0);
    const background = getComputedStyle(panel).backgroundColor;
    const note = panel.querySelector('.field-note');
    const foreground = getComputedStyle(note).color;
    return {
      background,
      contrast: (luminance(foreground) + 0.05) / (luminance(background) + 0.05),
      size: parseFloat(getComputedStyle(note).fontSize),
    };
  });
  assert.equal(readingSurface.background, 'rgb(11, 11, 11)');
  assert.ok(readingSurface.contrast >= 4.5 && readingSurface.size >= 14);
  assert.ok((await page.locator('.world-backdrop').boundingBox()).width >= 1438);
  await page.screenshot({ path: join(dir, 'ocean.png') });
  assert.equal(await page.locator('#world-halftone').count(), 0);
  assert.equal(await page.locator('.wordmark').first().textContent(), 'digital minimalism');
  await page.locator('#amount').fill('137.5');
  await page.evaluate(() => {
    window.savedOfflineForm = document.getElementById('action-form');
  });
  await page.locator('.world-nav [data-view="rewards"]').click();
  await page.waitForSelector('#world[data-view="rewards"]');
  await page.locator('.world-nav [data-view="guide"]').click();
  await page.waitForSelector('#world[data-view="guide"]');
  await page.locator('.world-nav [data-view="offline"]').click();
  assert.equal(await page.locator('#amount').inputValue(), '137.5');
  assert.ok(
    await page.evaluate(() => window.savedOfflineForm === document.getElementById('action-form')),
  );
  await page.screenshot({ path: join(dir, 'offline-panel.png') });
  await page.locator('#world-content').hover();
  await page.mouse.wheel(0, -1500);
  await page.waitForFunction(
    () => !document.getElementById('world').classList.contains('is-ready'),
  );
  await scroll(0);
  await page.waitForFunction(
    () => !document.getElementById('world').classList.contains('is-ready'),
  );
  assert.ok(
    Math.abs((await page.locator('.world-backdrop').boundingBox()).width - initial.width) < 2,
  );

  // Deep links bypass the trip and mobile resizing keeps the same live form.
  await page.goto(origin + '/#offline-space');
  await page.waitForSelector('#world[data-view="offline"]');
  await page.locator('#amount').fill('23');
  // Direct routing cancels old inertia, but the next real wheel can still leave.
  await page.locator('#world-content').hover();
  await page.mouse.wheel(0, -1500);
  await page.waitForFunction(
    () => !document.getElementById('world').classList.contains('is-ready'),
  );
  await page.goto(origin + '/#offline-space');
  await page.waitForSelector('#world.is-ready[data-view="offline"]');
  assert.equal(await page.locator('#amount').inputValue(), '23');
  await page.setViewportSize({ width: 390, height: 844 });
  await settle();
  assert.equal(await page.locator('#amount').inputValue(), '23');
  await page.screenshot({ path: join(dir, 'mobile-panel.png') });
  await page.locator('.world-nav [data-view="rewards"]').click();
  await page.locator('#world-panel-close').click();
  await page.screenshot({ path: join(dir, 'mobile-ocean.png') });
  await page.setViewportSize({ width: 320, height: 700 });
  await settle();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.evaluate(() =>
    document
      .getElementById('world-depth')
      .getContext('webgl')
      .getExtension('WEBGL_lose_context')
      .loseContext(),
  );
  await page.waitForSelector('#world[data-renderer="photograph"]');
  assert.ok(await page.locator('#amount').isVisible());

  // Reduced motion and browsers lacking ScrollTimeline keep the same routes and controls.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(origin + '/#leaderboard');
  await page.waitForSelector('#world[data-view="rewards"]');
  await page.locator('#world-panel-close').click();
  await page.locator('#world-brand').click();
  await page.waitForFunction(
    () => !document.getElementById('world').classList.contains('is-ready'),
  );
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.addInitScript(() => {
    window.ScrollTimeline = undefined;
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return type === 'webgl' ? null : getContext.call(this, type, ...args);
    };
  });
  await page.goto(origin);
  await page.waitForSelector('.portal-enabled');
  await settle();
  await scroll(0.5);
  assert.ok((await page.locator('.world-backdrop').boundingBox()).width > 500);
  await scroll(1);
  await page.waitForSelector('#world.is-ready[data-view="offline"]');
  await page.locator('#tab-withdraw').click();
  assert.equal(await page.locator('#tab-withdraw').getAttribute('aria-selected'), 'true');
  await page.locator('.world-nav [data-view="guide"]').click();
  await page.goBack();
  await page.waitForSelector('#world[data-view="offline"]');
  assert.deepEqual(errors, []);
  console.log(
    'PASS original grain shader, Albert Sans, reverse scroll, persistent drafts, mobile, reduced motion, WebGL loss and photograph/ScrollTimeline fallback.',
  );
  console.log('Portal screenshots: .e2e/portal/');
} finally {
  await browser?.close();
  server.kill();
}
