// Fails when anything links to a Squiggle repository other than the one in squiggle.config.json.
// Scans tracked files, the built site, the CLI and action bundles, and the .vsix manifest.
//   node scripts/check-links.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const cfg = JSON.parse(readFileSync(join(root, 'squiggle.config.json'), 'utf8'));
const allowed = /^https:\/\/github\.com\/([^/]+\/[^/]+)/.exec(cfg.repoUrl ?? '')?.[1]?.toLowerCase() ?? null;

const PATTERNS = [/github\.com\/([A-Za-z0-9-]+\/squiggle[A-Za-z0-9-]*)/gi, /uses:\s*([A-Za-z0-9-]+\/squiggle[A-Za-z0-9-]*)\/action/gi];
const problems = [];

function scan(label, text) {
  for (const re of PATTERNS) {
    for (const m of text.matchAll(re)) {
      const repo = m[1].toLowerCase();
      if (repo.startsWith('your-account/')) continue;
      if (allowed && repo === allowed) continue;
      problems.push(`${label}: ${m[0]}`);
    }
  }
}

const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
for (const f of tracked) {
  if (/\.(png|gif|mp4|woff2?|ttf|wasm|vsix)$/.test(f) || f === 'scripts/check-links.mjs') continue;
  scan(f, readFileSync(join(root, f), 'utf8'));
}

function walk(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(html|js|css|json|txt|sh|ps1)$/.test(name)) scan(p.slice(root.length), readFileSync(p, 'utf8'));
  }
}
for (const d of ['site/dist', 'packages/cli/dist', 'action/squiggle-render/dist']) walk(join(root, d));

const vsix = join(root, 'site/public/downloads/squiggle.vsix');
if (existsSync(vsix)) {
  for (const entry of ['extension/package.json', 'extension/readme.md', 'extension/README.md']) {
    try {
      scan(`squiggle.vsix:${entry}`, execFileSync('unzip', ['-p', vsix, entry], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
    } catch {
      // not in this package
    }
  }
}

if (problems.length) {
  console.error(`Links to a repository other than ${allowed ?? '(none configured)'}:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`no stray repository links (allowed: ${allowed ?? 'none'})`);
