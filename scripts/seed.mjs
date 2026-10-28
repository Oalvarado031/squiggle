// Pins the 12 seed pieces to the wall as house pieces ("by squiggle"), so it isn't empty on day one.
//   node scripts/seed.mjs https://squiggle.example.workers.dev
// Uses the admin token from .admin-token (written by scripts/deploy.mjs). Re-running is
// harmless: the server returns the existing piece for the same code.
import { readdirSync, readFileSync } from 'node:fs';

const base = (process.argv[2] ?? '').replace(/\/$/, '');
if (!base) {
  console.error('usage: node scripts/seed.mjs <site-url>');
  process.exit(1);
}
const token = readFileSync(new URL('../.admin-token', import.meta.url), 'utf8').trim();
const dir = new URL('../seeds/', import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith('.sqg')).sort();

for (const f of files) {
  const code = readFileSync(new URL(f, dir), 'utf8');
  const title = f.replace(/\.sqg$/, '').replace(/-/g, ' ');
  const res = await fetch(`${base}/api/pieces`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ code, title, house: true }),
  });
  const body = await res.json();
  console.log(res.ok ? `${title.padEnd(16)} ${base}/p/${body.id}${body.existing ? ' (already there)' : ''}` : `${title}: ${res.status} ${body.message}`);
  if (!res.ok) process.exitCode = 1;
}
