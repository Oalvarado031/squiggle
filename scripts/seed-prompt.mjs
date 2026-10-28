// Pins the house pieces in prompts/<week>/ into that week's prompt, so it has entries on day one.
//   node scripts/seed-prompt.mjs https://squigglee.online 2026-W44
// Uses the admin token from .admin-token. Re-running is harmless (same code → same piece).
import { readdirSync, readFileSync } from 'node:fs';

const base = (process.argv[2] ?? '').replace(/\/$/, '');
const week = process.argv[3] ?? '';
if (!base || !/^\d{4}-W\d{2}$/.test(week)) {
  console.error('usage: node scripts/seed-prompt.mjs <site-url> <YYYY-Www>');
  process.exit(1);
}
const token = readFileSync(new URL('../.admin-token', import.meta.url), 'utf8').trim();
const dir = new URL(`../prompts/${week}/`, import.meta.url);
for (const f of readdirSync(dir).filter((x) => x.endsWith('.sqg')).sort()) {
  const code = readFileSync(new URL(f, dir), 'utf8');
  const title = f.replace(/\.sqg$/, '').replace(/-/g, ' ');
  const res = await fetch(`${base}/api/pieces`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ code, title, house: true, prompt: week }),
  });
  const body = await res.json();
  console.log(res.ok ? `${title.padEnd(14)} ${base}/p/${body.id}${body.existing ? ' (already there)' : ''}` : `${title}: ${res.status} ${body.message}`);
  if (!res.ok) process.exitCode = 1;
}
