import resvgWasm from '@resvg/resvg-wasm/index_bg.wasm';
import fraunces400 from './fonts/Fraunces_400Regular.ttf';
import fraunces600 from './fonts/Fraunces_600SemiBold.ttf';
import mono400 from './fonts/JetBrainsMono_400Regular.ttf';
import { EXAMPLES, decodeCode } from 'squiggle-core';
import type { Env } from './env.ts';
import { links, page, securityHeaders } from './html.ts';
import { allow, detail, hide, ipHash, like, list, pin, promptInfo } from './pieces.ts';
import { finalizeWeek, themeFor, weekStart } from './prompt.ts';
import { cardOps, configureRenderer, ogCard } from './render.ts';
import { json, problem, sha256 } from './util.ts';

const renderer = () => configureRenderer(resvgWasm, [fraunces400, fraunces600, mono400]);

const PNG_HEADERS = { 'content-type': 'image/png', 'cache-control': 'public, max-age=31536000, immutable' };
const OG_HEADERS = { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' };

async function media(env: Env, key: string, req: Request): Promise<Response> {
  const obj = await env.MEDIA.get(key, { onlyIf: req.headers });
  if (!obj) return new Response('not found', { status: 404 });
  const headers = new Headers(PNG_HEADERS);
  headers.set('etag', obj.httpEtag);
  if (!('body' in obj) || !obj.body) return new Response(null, { status: 304, headers });
  return new Response(obj.body, { headers });
}

async function cached(env: Env, key: string, make: () => Promise<Uint8Array | null>): Promise<Response | null> {
  const hit = await env.MEDIA.get(key);
  if (hit) return new Response(hit.body, { headers: OG_HEADERS });
  const png = await make();
  if (!png) return null;
  await env.MEDIA.put(key, png, { httpMetadata: { contentType: 'image/png' } });
  return new Response(png, { headers: OG_HEADERS });
}

const SITE_CARD_PIECE = 'orbit-garden';

async function siteCard(env: Env): Promise<Response> {
  return (await cached(env, 'site/og-v1.png', async () => {
    await renderer();
    const ex = EXAMPLES.find((e) => e.slug === SITE_CARD_PIECE) ?? EXAMPLES[0];
    return ogCard(cardOps(ex.code), { title: 'Code you can post.', code: ex.code, kicker: 'a language for drawings that move' });
  }))!;
}

async function pieceCard(env: Env, id: string): Promise<Response> {
  // v2: house pieces say "by squiggle" instead of an @handle
  const res = await cached(env, `p/${id}/og-v2.png`, async () => {
    const row = await env.DB.prepare('SELECT code, title, handle, house FROM pieces WHERE id = ? AND hidden = 0').bind(id).first<{ code: string; title: string; handle: string | null; house: number }>();
    if (!row) return null;
    await renderer();
    return ogCard(cardOps(row.code), { title: row.title, byline: row.house ? 'by squiggle' : row.handle ? `@${row.handle}` : null, code: row.code });
  });
  return res ?? siteCard(env);
}

async function shareCard(env: Env, req: Request, payload: string): Promise<Response> {
  let code: string;
  try {
    code = await decodeCode(payload);
  } catch {
    return siteCard(env);
  }
  const key = `c/${(await sha256(code)).slice(0, 40)}.png`;
  const hit = await env.MEDIA.get(key);
  if (hit) return new Response(hit.body, { headers: OG_HEADERS });
  if (!(await allow(env, `og:${await ipHash(env, req)}`, 60))) return siteCard(env);
  try {
    await renderer();
    const png = ogCard(cardOps(code), { title: 'A Squiggle piece', code, kicker: 'shared from the studio' });
    await env.MEDIA.put(key, png, { httpMetadata: { contentType: 'image/png' } });
    return new Response(png, { headers: OG_HEADERS });
  } catch {
    return siteCard(env);
  }
}

async function asset(env: Env, req: Request, path: string): Promise<Response> {
  const url = new URL(req.url);
  url.pathname = path;
  url.search = '';
  return env.ASSETS.fetch(new Request(url.toString(), { headers: req.headers }));
}

async function notFound(env: Env, req: Request, origin: string, theme: string): Promise<Response> {
  const res = await asset(env, req, '/404');
  return page(env, res, origin, { theme, title: 'Not here · Squiggle' }, 404);
}

const HTML_PAGES = new Set(['/', '/studio', '/wall', '/learn', '/reference']);

// Is squigglelang on npm yet? Asked of the registry at most every 10 minutes.
let npmMemo: { published: boolean; until: number } | null = null;
async function cliPublished(env: Env): Promise<boolean> {
  if (npmMemo && npmMemo.until > Date.now()) return npmMemo.published;
  let published = false;
  const kv = await env.KV.get('npm:squigglelang');
  if (kv !== null) published = kv === '1';
  else {
    try {
      const res = await fetch('https://registry.npmjs.org/squigglelang', { headers: { accept: 'application/vnd.npm.install-v1+json' }, cf: { cacheTtl: 300 } } as RequestInit);
      published = res.ok;
    } catch {
      published = false;
    }
    await env.KV.put('npm:squigglelang', published ? '1' : '0', { expirationTtl: 600 });
  }
  npmMemo = { published, until: Date.now() + 120_000 };
  return published;
}

async function handle(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  // www, and (once CANONICAL_HOST is set) the workers.dev address, lead to the one real address.
  const canonical = env.CANONICAL_HOST || 'squigglee.online';
  if (url.hostname === `www.${canonical}` || (env.CANONICAL_HOST && url.hostname.endsWith('.workers.dev') && !url.pathname.startsWith('/api/'))) {
    url.hostname = canonical;
    return Response.redirect(url.toString(), 301);
  }
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const origin = url.origin;

  // ---- API ----
  if (path.startsWith('/api/')) {
    if (path === '/api/health') return json({ ok: true });
    if (path === '/api/pieces' && req.method === 'POST') {
      await renderer();
      return pin(env, req);
    }
    if (path === '/api/pieces' && req.method === 'GET') return list(env, url);
    if (path === '/api/prompt') return promptInfo(env);
    if (path === '/api/config') return json({ mint: env.TOKEN_MINT ?? '', cli: await cliPublished(env), links: links(env) }, 200, { 'cache-control': 'public, max-age=60' });
    if (path === '/api/admin/hide' && req.method === 'POST') return hide(env, req);
    let m = /^\/api\/pieces\/([a-z0-9]+)$/.exec(path);
    if (m && req.method === 'GET') {
      const p = await detail(env, m[1]);
      return p ? json({ piece: p }) : problem(404, 'No such piece.');
    }
    m = /^\/api\/pieces\/([a-z0-9]+)\/like$/.exec(path);
    if (m && req.method === 'POST') return like(env, req, m[1]);
    return problem(404, 'No such endpoint.');
  }

  // ---- pictures ----
  let m = /^\/media\/p\/([a-z0-9]+)\/(still|preview)\.png$/.exec(path);
  if (m) return media(env, `p/${m[1]}/${m[2]}.png`, req);
  m = /^\/og\/p\/([a-z0-9]+)\.png$/.exec(path);
  if (m) return pieceCard(env, m[1]);
  m = /^\/og\/c\/([A-Za-z0-9_-]{1,8000})\.png$/.exec(path);
  if (m) return shareCard(env, req, m[1]);
  if (path === '/og/site.png') return siteCard(env);

  const theme = await themeFor(env, Date.now());

  // ---- pages ----
  m = /^\/p\/([a-z0-9]+)$/.exec(path);
  if (m) {
    const p = await detail(env, m[1]);
    if (!p) return notFound(env, req, origin, theme);
    const handleText = p.house ? ' by squiggle' : p.handle ? ` by @${p.handle}` : '';
    return page(env, await asset(env, req, '/piece'), origin, {
      theme,
      title: `${p.title} · Squiggle`,
      description: `${p.title}${handleText}: a moving drawing in ${p.chars} characters of Squiggle. Open it to read the code or remix it.`,
      image: `/og/p/${m[1]}.png`,
      canonical: `/p/${m[1]}`,
      data: { piece: p, links: links(env) },
    });
  }

  if (HTML_PAGES.has(path)) {
    const res = await asset(env, req, path);
    const c = path === '/studio' ? url.searchParams.get('c') : null;
    if (c && /^[A-Za-z0-9_-]{1,8000}$/.test(c)) {
      return page(env, res, origin, { theme, title: 'A Squiggle piece', description: 'Open it in the Squiggle studio to watch it move and read the code.', image: `/og/c/${c}.png` });
    }
    return page(env, res, origin, { theme, canonical: path, cli: path === '/' ? await cliPublished(env) : undefined });
  }

  // ---- everything else is a static file ----
  const res = await env.ASSETS.fetch(req);
  if (res.status === 404) return notFound(env, req, origin, theme);
  if (path.endsWith('.sh') || path.endsWith('.ps1') || path.endsWith('.vsix')) {
    const headers = new Headers(res.headers);
    headers.set('content-type', path.endsWith('.vsix') ? 'application/vsix' : 'text/plain; charset=utf-8');
    return new Response(res.body, { status: res.status, headers });
  }
  if ((res.headers.get('content-type') ?? '').includes('text/html')) {
    return page(env, res, origin, { theme });
  }
  if (path.startsWith('/assets/') || path.startsWith('/fonts/')) {
    const headers = new Headers(res.headers);
    headers.set('cache-control', 'public, max-age=31536000, immutable');
    return new Response(res.body, { status: res.status, headers });
  }
  return res;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    try {
      return await handle(req, env);
    } catch (e) {
      console.error('request failed', req.method, new URL(req.url).pathname, e instanceof Error ? e.stack : e);
      const headers = new Headers({ 'content-type': 'application/json' });
      await securityHeaders(headers);
      return new Response(JSON.stringify({ message: 'Something went wrong on our side. Try again in a moment.' }), { status: 500, headers });
    }
  },
  async scheduled(_ev: ScheduledController, env: Env): Promise<void> {
    // Close last week's prompt: freeze its top three.
    await finalizeWeek(env, weekStart(Date.now()) - 1);
  },
} satisfies ExportedHandler<Env>;
