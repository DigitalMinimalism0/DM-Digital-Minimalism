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
  };
  await page.goto(origin);
  await page.waitForSelector('.portal-enabled');
  await page.evaluate(() => document.fonts.ready);
  await settle();
  let initial = await page.locator('.world-backdrop').boundingBox();
  const opening = await page.locator('.ocean-window').boundingBox();
  assert.ok(Math.abs(initial.width - opening.width) < 2);
  await page.screenshot({ path: join(dir, 'entrance.png') });
  await scroll(0.5);
  const middle = await page.locator('.world-backdrop').boundingBox();
  assert.ok(middle.width > initial.width * 1.5 && middle.width < 1440);
  await page.screenshot({ path: join(dir, 'mid-scroll.png') });
  await scroll(1);
  await page.waitForSelector('#world.is-ready[data-view="offline"]');
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
    'PASS scroll zoom, reverse scroll, direct participation, persistent drafts, deep links, mobile resize, reduced motion, browser history and ScrollTimeline fallback.',
  );
  console.log('Portal screenshots: .e2e/portal/');
} finally {
  await browser?.close();
  server.kill();
}
