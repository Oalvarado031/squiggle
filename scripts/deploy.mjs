// One-step production deploy. Safe to re-run: it reuses resources that already exist.
//   node scripts/deploy.mjs --account <account-id>
// 1. finds or creates the D1 database, R2 bucket and KV namespace and writes their ids into site/wrangler.jsonc
// 2. sets IP_SALT and ADMIN_TOKEN secrets the first time (the admin token is kept in .admin-token, gitignored)
// 3. applies D1 migrations, builds and deploys
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const site = new URL('../site/', import.meta.url).pathname;
const root = new URL('../', import.meta.url).pathname;
const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const account = arg('account') ?? process.env.CLOUDFLARE_ACCOUNT_ID;
if (!account) {
  console.error('Pass --account <id> (see `wrangler whoami`).');
  process.exit(1);
}
const env = { ...process.env, CLOUDFLARE_ACCOUNT_ID: account };
const wr = (args, opts = {}) => execFileSync('npx', ['wrangler', ...args], { cwd: site, env, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...opts });
const step = (s) => console.log(`\n▸ ${s}`);

step('D1 database');
const dbs = JSON.parse(wr(['d1', 'list', '--json']));
let db = dbs.find((d) => d.name === 'squiggle');
if (!db) {
  wr(['d1', 'create', 'squiggle']);
  db = JSON.parse(wr(['d1', 'list', '--json'])).find((d) => d.name === 'squiggle');
}
console.log(`squiggle ${db.uuid}`);

step('R2 bucket');
const buckets = wr(['r2', 'bucket', 'list']);
if (!/name:\s+squiggle-media\b/.test(buckets)) wr(['r2', 'bucket', 'create', 'squiggle-media']);
console.log('squiggle-media');

step('KV namespace');
let kv = JSON.parse(wr(['kv', 'namespace', 'list'])).find((n) => n.title === 'squiggle' || n.title === 'squiggle-KV');
if (!kv) {
  wr(['kv', 'namespace', 'create', 'squiggle']);
  kv = JSON.parse(wr(['kv', 'namespace', 'list'])).find((n) => n.title === 'squiggle' || n.title.endsWith('squiggle'));
}
console.log(`${kv.title} ${kv.id}`);

step('wrangler.jsonc');
const cfgPath = `${site}wrangler.jsonc`;
let cfg = readFileSync(cfgPath, 'utf8');
cfg = cfg.replace(/"database_id": "[^"]*"/, `"database_id": "${db.uuid}"`).replace(/("kv_namespaces": \[\{ "binding": "KV", "id": )"[^"]*"/, `$1"${kv.id}"`);
if (!cfg.includes('"account_id"')) cfg = cfg.replace('"name": "squiggle",', `"name": "squiggle",\n  "account_id": "${account}",`);
writeFileSync(cfgPath, cfg);

step('secrets');
const secrets = (() => {
  try {
    return JSON.parse(wr(['secret', 'list', '--format', 'json'])).map((s) => s.name);
  } catch {
    return [];
  }
})();
if (!secrets.includes('IP_SALT')) wr(['secret', 'put', 'IP_SALT'], { input: randomBytes(32).toString('hex') });
const tokenFile = `${root}.admin-token`;
if (!secrets.includes('ADMIN_TOKEN') || !existsSync(tokenFile)) {
  const token = randomBytes(24).toString('base64url');
  wr(['secret', 'put', 'ADMIN_TOKEN'], { input: token });
  writeFileSync(tokenFile, token + '\n', { mode: 0o600 });
}
console.log('IP_SALT, ADMIN_TOKEN');

step('migrations');
console.log(wr(['d1', 'migrations', 'apply', 'squiggle', '--remote'], { input: 'y\n' }).split('\n').filter((l) => /✅|No migrations/.test(l)).join('\n'));

step('build and deploy');
execFileSync('npx', ['vite', 'build'], { cwd: site, stdio: 'inherit' });
const out = wr(['deploy']);
const url = /https:\/\/[^\s]+\.workers\.dev/.exec(out)?.[0];
console.log(out.split('\n').filter((l) => /workers\.dev|Uploaded|Deployed|Current Version/.test(l)).join('\n'));
if (url) console.log(`\nlive at ${url}`);
