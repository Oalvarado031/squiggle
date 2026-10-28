import { lex, postLength, postText } from 'squiggle-core';
import type { Env } from './env.ts';
import { blockedWord } from './filter.ts';
import { finalizeWeek, themeFor, weekId, weekStart, weekTimes } from './prompt.ts';
import { PinError, renderPiece } from './render.ts';
import { clientIp, json, newId, problem, sha256 } from './util.ts';

export interface Row {
  id: string;
  code: string;
  code_hash: string;
  title: string;
  handle: string | null;
  chars: number;
  animated: number;
  interactive: number;
  parent_id: string | null;
  prompt_week: string | null;
  likes: number;
  remixes: number;
  preview_frames: number;
  preview_fps: number;
  preview_cols: number;
  preview_cell: number;
  hidden: number;
  house: number;
  created_at: number;
}

const LIST_COLUMNS = 'id, title, handle, house, chars, animated, interactive, parent_id, prompt_week, likes, remixes, preview_frames, preview_fps, preview_cols, created_at';

export function summary(r: Omit<Row, 'code' | 'code_hash' | 'hidden' | 'preview_cell'>) {
  return {
    id: r.id,
    title: r.title,
    // house pieces carry no handle: they're credited to Squiggle, never to an X account
    handle: r.house ? null : r.handle,
    house: !!r.house,
    chars: r.chars,
    likes: r.likes,
    remixes: r.remixes,
    animated: !!r.animated,
    interactive: !!r.interactive,
    created_at: r.created_at,
    parent_id: r.parent_id,
    prompt_week: r.prompt_week,
    preview: {
      still: `/media/p/${r.id}/still.png`,
      sprite: `/media/p/${r.id}/preview.png`,
      frames: r.preview_frames,
      fps: r.preview_fps,
      cols: r.preview_cols,
    },
  };
}

export async function ipHash(env: Env, req: Request): Promise<string> {
  return (await sha256(`${env.IP_SALT ?? 'squiggle-local-salt'}|${clientIp(req)}`)).slice(0, 32);
}

const RESERVED_HANDLES = new Set(['squiggle', 'squigglelang', 'admin', 'official']);
export const LIMITS = { code: 2000, title: 60, pinsPerHour: 6, pinsPerDay: 30, likesPerHour: 240, likesPerNetwork: 3 };

function isAdmin(env: Env, req: Request): boolean {
  const auth = req.headers.get('authorization') ?? '';
  return !!env.ADMIN_TOKEN && auth === `Bearer ${env.ADMIN_TOKEN}`;
}

/** KV counter for a rolling hour; returns false once the limit is reached. */
export async function allow(env: Env, key: string, limit: number): Promise<boolean> {
  const bucket = `rl:${key}:${Math.floor(Date.now() / 3_600_000)}`;
  const n = Number((await env.KV.get(bucket)) ?? 0);
  if (n >= limit) return false;
  await env.KV.put(bucket, String(n + 1), { expirationTtl: 3900 });
  return true;
}

/** true enters this week's prompt; the admin token may also name a week ("2026-W44") */
function promptWeek(value: unknown, admin: boolean, now: number): string | null {
  if (value === true) return weekId(now);
  if (admin && typeof value === 'string' && /^\d{4}-W\d{2}$/.test(value)) return value;
  return null;
}

// ---- pin ----

export async function pin(env: Env, req: Request): Promise<Response> {
  let body: { code?: unknown; title?: unknown; handle?: unknown; parent?: unknown; prompt?: unknown; house?: unknown };
  try {
    body = await req.json();
  } catch {
    return problem(400, 'Send the piece as JSON.');
  }
  const admin = isAdmin(env, req);
  // Only the admin token can pin as the house (the seed and prompt-starter scripts).
  const house = admin && (body.house === true || (typeof body.handle === 'string' && /^@?squiggle$/i.test(body.handle.trim())));
  const code = typeof body.code === 'string' ? postText(body.code) + '\n' : '';
  const title = typeof body.title === 'string' ? body.title.replace(/\s+/g, ' ').trim() : '';
  const handle = !house && typeof body.handle === 'string' && body.handle.trim() ? body.handle.trim().replace(/^@/, '') : null;
  const parent = typeof body.parent === 'string' && /^[a-z0-9]{6,12}$/.test(body.parent) ? body.parent : null;

  if (!code.trim()) return problem(422, 'There is no code to pin.');
  if (code.length > LIMITS.code) return problem(422, `Pieces on the wall can be up to ${LIMITS.code.toLocaleString('en-US')} characters; this one is ${code.length.toLocaleString('en-US')}.`);
  if (!title) return problem(422, 'Give the piece a title.');
  if ([...title].length > LIMITS.title) return problem(422, `Titles can be up to ${LIMITS.title} characters.`);
  if (handle !== null && !/^[A-Za-z0-9_]{1,15}$/.test(handle)) return problem(422, 'An X handle is 1 to 15 letters, digits or underscores.');
  if (handle && RESERVED_HANDLES.has(handle.toLowerCase()) && !admin) return problem(422, `@${handle} is reserved for the Squiggle team.`);

  // The filter reads the title, the handle, and every piece of text and comment in the code.
  let words = `${title} ${handle ?? ''}`;
  try {
    const { tokens, comments } = lex(code);
    words += ' ' + tokens.filter((t) => t.type === 'str').map((t) => String(t.value)).join(' ');
    words += ' ' + comments.map((c) => c.text).join(' ');
  } catch {
    // syntax errors are reported by the render below
  }
  if (blockedWord(words)) return problem(422, "Let's keep the wall friendly: the title or the text in the code has a word the wall doesn't allow.");

  // Seed pins from the admin token don't count against anyone's network.
  const ip = admin ? 'admin' : await ipHash(env, req);
  const now = Date.now();
  if (!admin) {
    const counts = await env.DB.prepare('SELECT SUM(created_at > ?) AS hour, COUNT(*) AS day FROM pieces WHERE ip_hash = ? AND created_at > ?')
      .bind(now - 3_600_000, ip, now - 86_400_000)
      .first<{ hour: number | null; day: number }>();
    if ((counts?.hour ?? 0) >= LIMITS.pinsPerHour) return problem(429, `That's ${LIMITS.pinsPerHour} pins in an hour, the most the wall takes from one place. Try again a little later.`);
    if ((counts?.day ?? 0) >= LIMITS.pinsPerDay) return problem(429, `That's ${LIMITS.pinsPerDay} pins today, the most the wall takes from one place. Try again tomorrow.`);
  }

  const codeHash = await sha256(code);
  const dupe = await env.DB.prepare('SELECT id FROM pieces WHERE code_hash = ? AND ip_hash = ? AND created_at > ? AND hidden = 0').bind(codeHash, ip, now - 600_000).first<{ id: string }>();
  if (dupe) return json({ id: dupe.id, url: `/p/${dupe.id}`, existing: true });

  let r;
  try {
    r = renderPiece(code);
  } catch (e) {
    if (e instanceof PinError) return problem(422, "The wall couldn't run this piece.", { error: e.error });
    throw e;
  }

  let parentRow: { id: string } | null = null;
  if (parent) parentRow = await env.DB.prepare('SELECT id FROM pieces WHERE id = ? AND hidden = 0').bind(parent).first<{ id: string }>();

  const id = newId();
  const media = { httpMetadata: { contentType: 'image/png', cacheControl: 'public, max-age=31536000, immutable' } };
  await Promise.all([env.MEDIA.put(`p/${id}/still.png`, r.still, media), env.MEDIA.put(`p/${id}/preview.png`, r.sprite, media)]);

  const stmts = [
    env.DB.prepare(
      `INSERT INTO pieces (id, code, code_hash, title, handle, house, chars, animated, interactive, parent_id, prompt_week, preview_frames, preview_fps, preview_cols, preview_cell, ip_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, code, codeHash, title, handle, house ? 1 : 0, postLength(code), r.animated ? 1 : 0, r.interactive ? 1 : 0, parentRow?.id ?? null, promptWeek(body.prompt, admin, now), r.frames, r.fps, r.cols, r.cell, ip, now),
  ];
  if (parentRow) stmts.push(env.DB.prepare('UPDATE pieces SET remixes = remixes + 1 WHERE id = ?').bind(parentRow.id));
  await env.DB.batch(stmts);
  return json({ id, url: `/p/${id}` }, 201);
}

// ---- the wall ----

export async function list(env: Env, url: URL): Promise<Response> {
  const sort = url.searchParams.get('sort') ?? 'new';
  const limit = Math.max(1, Math.min(48, Number(url.searchParams.get('limit')) || 24));
  const cursor = url.searchParams.get('cursor');
  const promptParam = url.searchParams.get('prompt');
  const now = Date.now();

  if (promptParam) {
    const week = promptParam === 'now' ? weekId(now) : /^\d{4}-W\d{2}$/.test(promptParam) ? promptParam : null;
    if (!week) return problem(400, 'Unknown prompt week.');
    const offset = Math.max(0, Number(cursor) || 0);
    const rows = await env.DB.prepare(`SELECT ${LIST_COLUMNS} FROM pieces WHERE prompt_week = ? AND hidden = 0 ORDER BY likes DESC, created_at DESC LIMIT ? OFFSET ?`)
      .bind(week, limit + 1, offset)
      .all<Row>();
    const more = rows.results.length > limit;
    return json({ pieces: rows.results.slice(0, limit).map(summary), next: more ? String(offset + limit) : null, week, theme: await themeFor(env, weekTimes(week) ?? now) });
  }

  if (sort === 'today' || sort === 'week') {
    const since = now - (sort === 'today' ? 86_400_000 : 7 * 86_400_000);
    const offset = Math.max(0, Number(cursor) || 0);
    const rows = await env.DB.prepare(
      `SELECT ${LIST_COLUMNS}, (SELECT COUNT(*) FROM likes l WHERE l.piece_id = p.id AND l.created_at > ?1) AS recent
       FROM pieces p WHERE p.hidden = 0 AND (p.created_at > ?1 OR EXISTS (SELECT 1 FROM likes l2 WHERE l2.piece_id = p.id AND l2.created_at > ?1))
       ORDER BY recent DESC, p.likes DESC, p.created_at DESC LIMIT ?2 OFFSET ?3`,
    )
      .bind(since, limit + 1, offset)
      .all<Row & { recent: number }>();
    const more = rows.results.length > limit;
    return json({ pieces: rows.results.slice(0, limit).map(summary), next: more ? String(offset + limit) : null });
  }

  // new: newest first, keyset paging on (created_at, id)
  let rows;
  const m = cursor ? /^(\d+)_([a-z0-9]+)$/.exec(cursor) : null;
  if (m) {
    rows = await env.DB.prepare(`SELECT ${LIST_COLUMNS} FROM pieces WHERE hidden = 0 AND (created_at < ? OR (created_at = ? AND id < ?)) ORDER BY created_at DESC, id DESC LIMIT ?`)
      .bind(Number(m[1]), Number(m[1]), m[2], limit + 1)
      .all<Row>();
  } else {
    rows = await env.DB.prepare(`SELECT ${LIST_COLUMNS} FROM pieces WHERE hidden = 0 ORDER BY created_at DESC, id DESC LIMIT ?`).bind(limit + 1).all<Row>();
  }
  const page = rows.results.slice(0, limit);
  const last = page[page.length - 1];
  return json({ pieces: page.map(summary), next: rows.results.length > limit && last ? `${last.created_at}_${last.id}` : null });
}

// ---- one piece ----

export async function detail(env: Env, id: string): Promise<Record<string, unknown> | null> {
  if (!/^[a-z0-9]{4,16}$/.test(id)) return null;
  const row = await env.DB.prepare('SELECT * FROM pieces WHERE id = ? AND hidden = 0').bind(id).first<Row>();
  if (!row) return null;
  const [parent, remixes, stamps] = await Promise.all([
    row.parent_id ? env.DB.prepare('SELECT id, title, CASE WHEN house = 1 THEN NULL ELSE handle END AS handle, house FROM pieces WHERE id = ? AND hidden = 0').bind(row.parent_id).first<{ id: string; title: string; handle: string | null; house: number }>() : null,
    env.DB.prepare(`SELECT ${LIST_COLUMNS} FROM pieces WHERE parent_id = ? AND hidden = 0 ORDER BY created_at DESC LIMIT 12`).bind(id).all<Row>(),
    env.DB.prepare('SELECT week, rank FROM prompt_winners WHERE piece_id = ? ORDER BY week').bind(id).all<{ week: string; rank: number }>(),
  ]);
  const stampList = await Promise.all(stamps.results.map(async (s) => ({ ...s, theme: await themeFor(env, weekTimes(s.week) ?? 0) })));
  return { ...summary(row), code: row.code, parent: parent ?? null, remix_list: remixes.results.map(summary), stamps: stampList };
}

// ---- likes ----

export async function like(env: Env, req: Request, id: string): Promise<Response> {
  let body: { browser?: unknown };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const browser = typeof body.browser === 'string' && /^[a-z0-9]{24}$/.test(body.browser) ? body.browser : null;
  if (!browser) return problem(400, 'Missing browser id.');
  const piece = await env.DB.prepare('SELECT likes FROM pieces WHERE id = ? AND hidden = 0').bind(id).first<{ likes: number }>();
  if (!piece) return problem(404, 'No such piece.');
  const ip = await ipHash(env, req);
  const already = await env.DB.prepare('SELECT 1 AS x FROM likes WHERE piece_id = ? AND browser_id = ?').bind(id, browser).first();
  if (already) return problem(409, 'You already liked this one.', { likes: piece.likes });
  const fromNetwork = await env.DB.prepare('SELECT COUNT(*) AS n FROM likes WHERE piece_id = ? AND ip_hash = ?').bind(id, ip).first<{ n: number }>();
  if ((fromNetwork?.n ?? 0) >= LIMITS.likesPerNetwork) return problem(429, 'This network has already liked this piece a few times.');
  if (!(await allow(env, `like:${ip}`, LIMITS.likesPerHour))) return problem(429, 'Lots of likes from here this hour. Try again later.');
  const now = Date.now();
  const res = await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO likes (piece_id, browser_id, ip_hash, created_at) VALUES (?, ?, ?, ?)').bind(id, browser, ip, now),
    env.DB.prepare('UPDATE pieces SET likes = (SELECT COUNT(*) FROM likes WHERE piece_id = ?) WHERE id = ?').bind(id, id),
    env.DB.prepare('SELECT likes FROM pieces WHERE id = ?').bind(id),
  ]);
  const likes = (res[2].results as Array<{ likes: number }>)[0]?.likes ?? piece.likes + 1;
  return json({ likes });
}

// ---- weekly prompt ----

export async function promptInfo(env: Env): Promise<Response> {
  const now = Date.now();
  const lastWeek = weekStart(now) - 1;
  await finalizeWeek(env, lastWeek);
  const winners = await env.DB.prepare(
    `SELECT w.rank, w.likes AS final_likes, ${LIST_COLUMNS.split(', ').map((c) => `p.${c}`).join(', ')} FROM prompt_winners w JOIN pieces p ON p.id = w.piece_id WHERE w.week = ? AND p.hidden = 0 ORDER BY w.rank`,
  )
    .bind(weekId(lastWeek))
    .all<Row & { rank: number }>();
  return json({
    week: weekId(now),
    theme: await themeFor(env, now),
    ends: weekStart(now) + 7 * 86_400_000,
    last: { week: weekId(lastWeek), theme: await themeFor(env, lastWeek), winners: winners.results.map((r) => ({ rank: r.rank, piece: summary(r) })) },
  });
}

export async function hide(env: Env, req: Request): Promise<Response> {
  if (!isAdmin(env, req)) return problem(403, 'Not allowed.');
  const { id, hidden } = (await req.json()) as { id?: string; hidden?: boolean };
  if (!id) return problem(400, 'Missing id.');
  await env.DB.prepare('UPDATE pieces SET hidden = ? WHERE id = ?').bind(hidden === false ? 0 : 1, id).run();
  return json({ ok: true });
}
