#!/usr/bin/env node
// Builds the extension: regenerates the vocabulary files and icons, runs the checks, packages
// the .vsix with vsce, and copies it to site/public/downloads/squiggle.vsix for the site.
// Run it with `npm run package -w squiggle-vscode`. (Publishing to the Marketplace is separate:
// it needs the squigglelang publisher's token.)

import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
const run = (cmd, args) => execFileSync(cmd, args, { cwd: pkgDir, stdio: 'inherit' });

run(process.execPath, ['scripts/gen-grammar.mjs']);
run(process.execPath, ['scripts/gen-icons.mjs']);
run(process.execPath, ['scripts/check.mjs']);

const out = `${pkg.name}-${pkg.version}.vsix`;
// Until squiggle.config.json names a repository, the manifest has none; vsce would stop to ask.
run('npx', ['--yes', '@vscode/vsce@4.0.0', 'package', '--no-dependencies', ...(pkg.repository ? [] : ['--allow-missing-repository']), '--out', out]);

const downloads = join(pkgDir, '..', '..', 'site', 'public', 'downloads');
mkdirSync(downloads, { recursive: true });
copyFileSync(join(pkgDir, out), join(downloads, 'squiggle.vsix'));
console.log(`copied ${out} (${(statSync(join(pkgDir, out)).size / 1024).toFixed(1)} KB) to site/public/downloads/squiggle.vsix`);
