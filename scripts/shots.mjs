// Screenshots of every page at desktop and phone widths, plus console errors and
// horizontal-scroll checks. Usage: node scripts/shots.mjs <base-url> <out-dir> [paths...]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://127.0.0.1:8799';
const out = process.argv[3] ?? 'out/shots';
const paths = process.argv.slice(4).length ? process.argv.slice(4) : ['/', '/studio', '/wall', '/learn', '/reference', '/nope'];
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
let problems = 0;
for (const [label, viewport] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 375, height: 812 }]]) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: label === 'phone' ? 2 : 1 });
  for (const path of paths) {
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(base + path, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const name = `${label}-${path === '/' ? 'home' : path.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '')}.png`;
    await page.screenshot({ path: `${out}/${name}`, fullPage: label === 'phone' ? false : false });
    const bad = errors.filter((e) => !(path === '/nope' && e.includes('404')));
    if (bad.length || overflow > 0) problems++;
    console.log(`${label.padEnd(7)} ${path.padEnd(12)} overflow=${overflow} errors=${bad.length}${bad.length ? '\n    ' + bad.join('\n    ') : ''}`);
    await page.close();
  }
  await ctx.close();
}
await browser.close();
process.exit(problems ? 1 : 0);
