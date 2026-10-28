// Small stand-ins for D1, R2 and KV so the API can be tested in Node.
// D1 runs on Node's built-in SQLite with the real migration.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Env } from '../src/worker/env.ts';

class Stmt {
  private args: unknown[] = [];
  constructor(private db: DatabaseSync, readonly sql: string) {}
  bind(...args: unknown[]) {
    const s = new Stmt(this.db, this.sql);
    s.args = args.map((a) => (typeof a === 'boolean' ? Number(a) : a === undefined ? null : a));
    return s;
  }
  async first<T>(col?: string): Promise<T | null> {
    const row = this.db.prepare(this.sql).get(...(this.args as never[])) as Record<string, unknown> | undefined;
    if (!row) return null;
    return (col ? row[col] : { ...row }) as T;
  }
  async all<T>() {
    return { results: this.db.prepare(this.sql).all(...(this.args as never[])).map((r) => ({ ...r })) as T[], success: true, meta: {} };
  }
  async run() {
    const r = this.db.prepare(this.sql).run(...(this.args as never[]));
    return { results: [], success: true, meta: { changes: Number(r.changes) } };
  }
  exec() {
    return /^\s*select/i.test(this.sql) ? { results: this.db.prepare(this.sql).all(...(this.args as never[])).map((r) => ({ ...r })) } : (this.db.prepare(this.sql).run(...(this.args as never[])), { results: [] });
  }
}

export function fakeD1() {
  const db = new DatabaseSync(':memory:');
  for (const m of ['0001_init.sql', '0002_house.sql']) db.exec(readFileSync(fileURLToPath(new URL(`../migrations/${m}`, import.meta.url)), 'utf8'));
  return {
    raw: db,
    prepare: (sql: string) => new Stmt(db, sql),
    async batch(stmts: Stmt[]) {
      db.exec('BEGIN');
      try {
        const out = stmts.map((s) => s.exec());
        db.exec('COMMIT');
        return out;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
  };
}

export function fakeR2() {
  const store = new Map<string, Uint8Array>();
  return {
    store,
    async put(key: string, data: Uint8Array) {
      store.set(key, data);
    },
    async get(key: string) {
      const data = store.get(key);
      return data ? { body: new Blob([data]).stream(), httpEtag: '"e"', arrayBuffer: async () => data.buffer } : null;
    },
  };
}

export function fakeKV() {
  const store = new Map<string, string>();
  return {
    store,
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
  };
}

export function fakeEnv(extra: Partial<Env> = {}): Env & { DB: ReturnType<typeof fakeD1>; MEDIA: ReturnType<typeof fakeR2> } {
  return {
    DB: fakeD1(),
    MEDIA: fakeR2(),
    KV: fakeKV(),
    ASSETS: { fetch: async () => new Response('') },
    IP_SALT: 'test-salt',
    ADMIN_TOKEN: 'admin-secret',
    ...extra,
  } as never;
}

export function req(path: string, body?: unknown, ip = '203.0.113.7', headers: Record<string, string> = {}): Request {
  return new Request(`https://squiggle.test${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip, ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
