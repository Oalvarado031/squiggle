// squiggle.config.json is the one place for the site address, the repository, the X account
// and the author. This writes those values everywhere they're needed:
//   site/wrangler.jsonc vars (REPO_URL, X_URL, AUTHOR_NAME, AUTHOR_URL, CANONICAL_HOST)
//   packages/core/src/site.ts (SITE_URL, used by the CLI and the extension)
//   packages/cli/package.json and packages/vscode/package.json (repository, bugs, homepage, author)
//   the <!-- sync:… --> blocks in README.md, action/squiggle-render/README.md, packages/vscode/README.md
//
//   npm run sync-config            write the files
//   npm run sync-config -- --check exit 1 if any file is out of date (CI)
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const at = (p) => new URL(p, root);
const cfg = JSON.parse(readFileSync(at('squiggle.config.json'), 'utf8'));
const check = process.argv.includes('--check');

for (const key of ['siteUrl', 'repoUrl', 'xUrl', 'authorUrl']) {
  const v = cfg[key] ?? '';
  if (v && !/^https:\/\/[^\s"'<>]+$/.test(v)) throw new Error(`${key} must be an https:// URL or empty (got ${v})`);
  cfg[key] = v.replace(/\/+$/, '');
}
if (!cfg.siteUrl) throw new Error('siteUrl is required');
cfg.authorName = (cfg.authorName ?? '').trim();

// "https://github.com/acct/repo" → "acct/repo", for the action's `uses:` line
const repoPath = /^https:\/\/github\.com\/([^/]+\/[^/]+)$/.exec(cfg.repoUrl)?.[1] ?? null;

let stale = 0;
function write(path, next) {
  const prev = readFileSync(at(path), 'utf8');
  if (prev === next) return;
  stale++;
  if (check) console.log(`out of date: ${path}`);
  else {
    writeFileSync(at(path), next);
    console.log(`updated ${path}`);
  }
}

function block(path, name, body) {
  const text = readFileSync(at(path), 'utf8');
  const re = new RegExp(`(<!-- sync:${name} -->\\n)[\\s\\S]*?(<!-- /sync:${name} -->)`);
  if (!re.test(text)) throw new Error(`${path} has no <!-- sync:${name} --> block`);
  write(path, text.replace(re, (_, a, b) => `${a}${body.trimEnd()}\n${b}`));
}

// ---- the Worker ----
{
  const path = 'site/wrangler.jsonc';
  const text = readFileSync(at(path), 'utf8');
  const mint = /"TOKEN_MINT": "([^"]*)"/.exec(text)?.[1] ?? '';
  const vars = `"vars": {
    // Set TOKEN_MINT to show the contract address in the footer chip.
    "TOKEN_MINT": ${JSON.stringify(mint)},
    // The values below come from squiggle.config.json (npm run sync-config). Empty hides the link.
    "REPO_URL": ${JSON.stringify(cfg.repoUrl)},
    "X_URL": ${JSON.stringify(cfg.xUrl)},
    "AUTHOR_NAME": ${JSON.stringify(cfg.authorName)},
    "AUTHOR_URL": ${JSON.stringify(cfg.authorUrl)},
    // the workers.dev address redirects here (the API stays reachable on both)
    "CANONICAL_HOST": ${JSON.stringify(new URL(cfg.siteUrl).hostname)}
  }`;
  write(path, text.replace(/"vars": \{[\s\S]*?\n  \}/, vars));
}

// ---- the site address in core (CLI `link`, the extension's default studio URL) ----
{
  const path = 'packages/core/src/site.ts';
  const text = readFileSync(at(path), 'utf8');
  write(path, text.replace(/export const SITE_URL = '[^']*';/, `export const SITE_URL = '${cfg.siteUrl}';`));
}

// ---- package manifests ----
function manifest(path, directory) {
  const text = readFileSync(at(path), 'utf8');
  const pkg = JSON.parse(text);
  const order = Object.keys(pkg);
  delete pkg.repository;
  delete pkg.bugs;
  delete pkg.author;
  pkg.homepage = cfg.siteUrl;
  if (cfg.repoUrl) {
    pkg.repository = { type: 'git', url: `git+${cfg.repoUrl}.git`, directory };
    pkg.bugs = { url: `${cfg.repoUrl}/issues` };
  }
  if (cfg.authorName) pkg.author = cfg.authorUrl ? { name: cfg.authorName, url: cfg.authorUrl } : cfg.authorName;
  // keep the original key order, new keys after "license"
  const out = {};
  for (const k of order) if (k in pkg) out[k] = pkg[k];
  for (const k of ['homepage', 'repository', 'bugs', 'author']) if (k in pkg && !(k in out)) out[k] = pkg[k];
  write(path, JSON.stringify(out, null, 2) + '\n');
}
manifest('packages/cli/package.json', 'packages/cli');
manifest('packages/vscode/package.json', 'packages/vscode');

// ---- README blocks ----
const uses = `${repoPath ?? 'YOUR-ACCOUNT/squiggle'}/action/squiggle-render@main`;
block('README.md', 'action-uses', `\`\`\`yaml\n- uses: ${uses}\n  with:\n    commit: 'true'\n\`\`\``);
block('action/squiggle-render/README.md', 'action-uses', `\`\`\`yaml
name: Render Squiggle pieces
on:
  push:
    paths: ['**.sqg']
permissions:
  contents: write
jobs:
  render:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: ${uses}
        with:
          commit: 'true'
\`\`\`${repoPath ? '' : '\n\nReplace `YOUR-ACCOUNT/squiggle` with the repository that hosts Squiggle.'}`);
const host = cfg.siteUrl.replace(/^https:\/\//, '');
block('packages/vscode/README.md', 'links', [
  `- Squiggle Studio: [${host}/studio](${cfg.siteUrl}/studio)`,
  `- Every command and built-in: [${host}/reference](${cfg.siteUrl}/reference)`,
  ...(cfg.repoUrl ? [`- Source and issues: [${cfg.repoUrl.replace(/^https:\/\//, '')}](${cfg.repoUrl})`] : []),
].join('\n'));

if (check && stale) {
  console.log(`\n${stale} file(s) don't match squiggle.config.json: run npm run sync-config`);
  process.exit(1);
}
if (!stale) console.log('everything matches squiggle.config.json');
