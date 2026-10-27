// Finds every .sqg file under SQG_PATH and renders it to a PNG with the bundled CLI.
import { readdirSync, mkdirSync, appendFileSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const { main } = await import(join(here, 'dist', 'cli.js'));

const root = resolve(process.env.SQG_PATH || '.');
const out = process.env.SQG_OUT ? resolve(process.env.SQG_OUT) : '';
const size = process.env.SQG_SIZE || '1024';
const t = process.env.SQG_T || '1';
const skip = new Set(['node_modules', '.git', 'dist', 'build']);

function walk(dir, found = []) {
  for (const name of readdirSync(dir)) {
    if (skip.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, found);
    else if (name.endsWith('.sqg')) found.push(full);
  }
  return found;
}

const files = walk(root).sort();
if (!files.length) {
  console.log(`No .sqg files under ${root}.`);
  process.exit(0);
}
const written = [];
let failed = 0;
for (const file of files) {
  const target = out ? join(out, relative(root, file)).replace(/\.sqg$/, '.png') : file.replace(/\.sqg$/, '.png');
  mkdirSync(dirname(target), { recursive: true });
  const code = await main(['render', file, '--out', target, '--size', size, '--t', t, '--quiet']);
  if (code === 0) {
    written.push(relative(process.cwd(), target));
    console.log(`rendered ${relative(process.cwd(), file)} → ${relative(process.cwd(), target)}`);
  } else {
    failed++;
    console.log(`::error file=${relative(process.cwd(), file)}::${basename(file)} didn't render (see the log above)`);
  }
}
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `files<<SQG_EOF\n${written.join('\n')}\nSQG_EOF\n`);
console.log(`${written.length} rendered, ${failed} failed.`);
process.exit(failed ? 1 : 0);
