import { chromium } from '@playwright/test';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 375, height: 812 } });
await p.goto(process.argv[2], { waitUntil: 'networkidle' });
const r = await p.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1).slice(0, 8).map((e) => `${e.tagName}.${e.className} right=${Math.round(e.getBoundingClientRect().right)}`));
console.log(r.join('\n'));
await b.close();
