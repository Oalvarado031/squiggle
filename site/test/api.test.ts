import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { configureRenderer, ogCard, cardOps, renderPiece, PinError, PIN_BUDGET } from '../src/worker/render.ts';
import { detail, like, list, pin, promptInfo } from '../src/worker/pieces.ts';
import { blockedWord } from '../src/worker/filter.ts';
import { finalizeWeek, rotationTheme, weekId, weekStart, weekTimes } from '../src/worker/prompt.ts';
import { THEME_SCRIPT } from '../src/worker/html.ts';
import { fakeEnv, req } from './fakes.ts';

const file = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)));
const ORBIT = file('../../examples/orbit-garden.sqg').toString();

beforeAll(async () => {
  await configureRenderer(file('../../node_modules/@resvg/resvg-wasm/index_bg.wasm'), [
    file('../src/worker/fonts/Fraunces_400Regular.ttf'),
    file('../src/worker/fonts/Fraunces_600SemiBold.ttf'),
    file('../src/worker/fonts/JetBrainsMono_400Regular.ttf'),
  ]);
});

const pngSize = (b: Uint8Array) => {
  const v = new DataView(b.buffer, b.byteOffset);
  return [v.getUint32(16), v.getUint32(20)];
};

let env: ReturnType<typeof fakeEnv>;
beforeEach(() => {
  env = fakeEnv();
});

async function pinOk(body: Record<string, unknown>, ip?: string) {
  const res = await pin(env, req('/api/pieces', { code: ORBIT, title: 'orbit garden', ...body }, ip));
  expect(res.status).toBe(201);
  return (await res.json()) as { id: string };
}

describe('pinning', () => {
  it('renders a still and a 3-second preview and stores the piece', async () => {
    const { id } = await pinOk({ handle: '@ana_b', prompt: true });
    const row = env.DB.raw.prepare('SELECT * FROM pieces WHERE id = ?').get(id) as Record<string, unknown>;
    expect(row).toMatchObject({ title: 'orbit garden', handle: 'ana_b', chars: 123, animated: 1, preview_frames: 45, preview_fps: 15, preview_cols: 9, prompt_week: weekId(Date.now()) });
    expect(pngSize(env.MEDIA.store.get(`p/${id}/still.png`)!)).toEqual([512, 512]);
    expect(pngSize(env.MEDIA.store.get(`p/${id}/preview.png`)!)).toEqual([9 * 320, 5 * 320]);
  });

  it('stores a still piece with a one-frame preview', async () => {
    const { id } = await pinOk({ code: 'paper night\ndot 0, 0, 80, ochre', title: 'moon' });
    expect(env.DB.raw.prepare('SELECT preview_frames, animated FROM pieces WHERE id = ?').get(id)).toEqual({ preview_frames: 1, animated: 0 });
  });

  it('refuses code that fails, with the line and a fix', async () => {
    const res = await pin(env, req('/api/pieces', { code: 'every frame\n  dot t, 0', title: 'x' }));
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: { line: 2, col: 3, message: 'dot needs 3 numbers: x, y, size (got 2)' } });
  });

  it('refuses a piece that runs past the step budget', async () => {
    const res = await pin(env, req('/api/pieces', { code: 'every frame\n  repeat 1000000\n    x = 1', title: 'loop' }));
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: { kind: 'budget', line: 2 } });
  });

  it.each([
    [{ title: '' }, 'Give the piece a title.'],
    [{ title: 'x'.repeat(61) }, 'Titles can be up to 60 characters.'],
    [{ handle: 'not a handle' }, 'An X handle is 1 to 15 letters, digits or underscores.'],
    [{ handle: 'squiggle' }, '@squiggle is reserved for the Squiggle team.'],
    [{ code: '   ' }, 'There is no code to pin.'],
    [{ code: 'x = 1\n'.repeat(400) }, 'Pieces on the wall can be up to 2,000 characters; this one is 2,400.'],
    [{ title: 'n4zi art' }, "Let's keep the wall friendly: the title or the text in the code has a word the wall doesn't allow."],
    [{ code: 'write "you f u c k e r", 0, 0' }, "Let's keep the wall friendly: the title or the text in the code has a word the wall doesn't allow."],
    [{ code: 'write "cocky robin", 0, 0' }, null],
    [{ code: 'write "a slur: nigger", 0, 0' }, "Let's keep the wall friendly: the title or the text in the code has a word the wall doesn't allow."],
    [{ code: '// rape joke\ndot 0, 0, 5' }, "Let's keep the wall friendly: the title or the text in the code has a word the wall doesn't allow."],
  ])('validates %j', async (body, message) => {
    const res = await pin(env, req('/api/pieces', { code: ORBIT, title: 'ok', ...body }));
    if (message === null) {
      expect(res.status).toBe(201);
      return;
    }
    expect(res.status).toBe(422);
    expect(((await res.json()) as { message: string }).message).toBe(message);
  });

  it('lets the admin token pin house pieces without using up the network\'s pins', async () => {
    for (let k = 0; k < 8; k++) {
      const res = await pin(env, req('/api/pieces', { code: `dot ${k}, 0, 9`, title: 'seed', house: true }, undefined, { authorization: 'Bearer admin-secret' }));
      expect(res.status).toBe(201);
    }
    await pinOk({ code: 'dot 50, 0, 9', title: 'mine' });
  });

  it('credits house pieces to Squiggle, never to an X handle', async () => {
    const res = await pin(env, req('/api/pieces', { code: ORBIT, title: 'seed', handle: '@squiggle' }, undefined, { authorization: 'Bearer admin-secret' }));
    const { id } = (await res.json()) as { id: string };
    expect(await detail(env, id)).toMatchObject({ house: true, handle: null });
    expect(env.DB.raw.prepare('SELECT handle, house FROM pieces WHERE id = ?').get(id)).toEqual({ handle: null, house: 1 });
  });

  it("doesn't let people pin as the house", async () => {
    const res = await pin(env, req('/api/pieces', { code: ORBIT, title: 'x', house: true }));
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    expect(await detail(env, id)).toMatchObject({ house: false });
  });

  it('limits pins per network per hour, but not for the admin', async () => {
    for (let k = 0; k < 6; k++) await pinOk({ code: `dot ${k}, 0, 9`, title: `p${k}` });
    const seventh = await pin(env, req('/api/pieces', { code: 'dot 99, 0, 9', title: 'p7' }));
    expect(seventh.status).toBe(429);
    const other = await pin(env, req('/api/pieces', { code: 'dot 99, 0, 9', title: 'p7' }, '198.51.100.2'));
    expect(other.status).toBe(201);
    const admin = await pin(env, req('/api/pieces', { code: 'dot 98, 0, 9', title: 'p8' }, undefined, { authorization: 'Bearer admin-secret' }));
    expect(admin.status).toBe(201);
  });

  it('returns the same piece when the same code is pinned twice in a row', async () => {
    const a = await pinOk({});
    const res = await pin(env, req('/api/pieces', { code: ORBIT, title: 'again' }));
    expect(await res.json()).toMatchObject({ id: a.id, existing: true });
  });

  it('never stores raw IP addresses', async () => {
    const { id } = await pinOk({});
    const row = env.DB.raw.prepare('SELECT ip_hash FROM pieces WHERE id = ?').get(id) as { ip_hash: string };
    expect(row.ip_hash).toMatch(/^[0-9a-f]{32}$/);
    expect(row.ip_hash).not.toContain('203.0.113.7');
  });
});

describe('remix family', () => {
  it('links a remix to its parent and counts it', async () => {
    const parent = await pinOk({ handle: 'ana' });
    const child = await pinOk({ code: ORBIT.replace('48', '60'), title: 'more orbit', parent: parent.id }, '198.51.100.9');
    const p = await detail(env, parent.id);
    const c = await detail(env, child.id);
    expect(p).toMatchObject({ remixes: 1, remix_list: [{ id: child.id, title: 'more orbit' }] });
    expect(c).toMatchObject({ parent: { id: parent.id, title: 'orbit garden', handle: 'ana' } });
  });

  it('ignores a parent that does not exist', async () => {
    const child = await pinOk({ parent: 'zzzzzzzz' });
    expect(await detail(env, child.id)).toMatchObject({ parent: null });
  });

  it('hides hidden pieces', async () => {
    const { id } = await pinOk({});
    env.DB.raw.prepare('UPDATE pieces SET hidden = 1 WHERE id = ?').run(id);
    expect(await detail(env, id)).toBeNull();
  });
});

describe('likes', () => {
  const browser = (k: number) => `b${String(k).padStart(23, '0')}`;

  it('counts one like per browser', async () => {
    const { id } = await pinOk({});
    const r1 = await like(env, req(`/api/pieces/${id}/like`, { browser: browser(1) }), id);
    expect(await r1.json()).toEqual({ likes: 1 });
    const again = await like(env, req(`/api/pieces/${id}/like`, { browser: browser(1) }), id);
    expect(again.status).toBe(409);
  });

  it('caps likes from one network on one piece', async () => {
    const { id } = await pinOk({});
    for (let k = 1; k <= 3; k++) expect((await like(env, req(`/x`, { browser: browser(k) }), id)).status).toBe(200);
    expect((await like(env, req(`/x`, { browser: browser(4) }), id)).status).toBe(429);
    expect((await like(env, req(`/x`, { browser: browser(4) }, '198.51.100.20'), id)).status).toBe(200);
  });

  it('rejects bad browser ids and unknown pieces', async () => {
    const { id } = await pinOk({});
    expect((await like(env, req('/x', { browser: 'short' }), id)).status).toBe(400);
    expect((await like(env, req('/x', { browser: browser(1) }), 'nopenope')).status).toBe(404);
  });
});

describe('the wall', () => {
  async function seed(n: number) {
    const ids: string[] = [];
    for (let k = 0; k < n; k++) {
      const { id } = await pinOk({ code: `dot ${k}, 0, 9`, title: `piece ${k}` }, `198.51.100.${k}`);
      env.DB.raw.prepare('UPDATE pieces SET created_at = ? WHERE id = ?').run(Date.now() - (n - k) * 1000, id);
      ids.push(id);
    }
    return ids;
  }

  it('lists the newest first and pages with a cursor', async () => {
    const ids = await seed(5);
    const first = (await (await list(env, new URL('https://x/api/pieces?limit=2'))).json()) as { pieces: Array<{ id: string }>; next: string };
    expect(first.pieces.map((p) => p.id)).toEqual([ids[4], ids[3]]);
    const second = (await (await list(env, new URL(`https://x/api/pieces?limit=2&cursor=${first.next}`))).json()) as { pieces: Array<{ id: string }>; next: string | null };
    expect(second.pieces.map((p) => p.id)).toEqual([ids[2], ids[1]]);
    const third = (await (await list(env, new URL(`https://x/api/pieces?limit=2&cursor=${second.next}`))).json()) as { pieces: Array<{ id: string }>; next: string | null };
    expect(third.pieces.map((p) => p.id)).toEqual([ids[0]]);
    expect(third.next).toBeNull();
  });

  it('ranks top today by likes received today', async () => {
    const ids = await seed(3);
    const now = Date.now();
    const add = (id: string, k: number, at: number) => env.DB.raw.prepare('INSERT INTO likes VALUES (?, ?, ?, ?)').run(id, `b${k}`, `ip${k}`, at);
    add(ids[0], 1, now - 1000);
    add(ids[0], 2, now - 1000);
    add(ids[2], 3, now - 1000);
    add(ids[1], 4, now - 3 * 86_400_000); // old like: counts for the week, not today
    add(ids[1], 5, now - 3 * 86_400_000);
    add(ids[1], 6, now - 3 * 86_400_000);
    env.DB.raw.prepare('UPDATE pieces SET created_at = ? WHERE id = ?').run(now - 5 * 86_400_000, ids[1]);
    const today = (await (await list(env, new URL('https://x/api/pieces?sort=today'))).json()) as { pieces: Array<{ id: string }> };
    expect(today.pieces.map((p) => p.id)).toEqual([ids[0], ids[2]]);
    const week = (await (await list(env, new URL('https://x/api/pieces?sort=week'))).json()) as { pieces: Array<{ id: string }> };
    expect(week.pieces[0].id).toBe(ids[1]);
  });

  it("filters to this week's prompt", async () => {
    await pinOk({ prompt: true });
    await pinOk({ code: 'dot 1, 1, 1', title: 'no prompt' }, '198.51.100.40');
    const r = (await (await list(env, new URL('https://x/api/pieces?prompt=now'))).json()) as { pieces: unknown[]; theme: string };
    expect(r.pieces).toHaveLength(1);
    expect(r.theme).toBe(rotationTheme(Date.now()));
  });

  it('gives each card its preview sprite layout', async () => {
    await pinOk({});
    const r = (await (await list(env, new URL('https://x/api/pieces'))).json()) as { pieces: Array<{ preview: unknown }> };
    expect(r.pieces[0].preview).toMatchObject({ frames: 45, fps: 15, cols: 9, still: expect.stringMatching(/still\.png$/) });
  });
});

describe('weekly prompt', () => {
  it('starts the rotation with weather on the week of 2026-10-26', () => {
    const tue = Date.UTC(2026, 9, 27, 12);
    expect(weekId(tue)).toBe('2026-W44');
    expect(rotationTheme(tue)).toBe('weather');
    expect(rotationTheme(tue + 7 * 86_400_000)).toBe('machines');
    expect(new Date(weekStart(tue)).toISOString()).toBe('2026-10-26T00:00:00.000Z');
    expect(weekTimes('2026-W44')).toBe(Date.UTC(2026, 9, 26));
  });

  it('gets ISO weeks right across new year', () => {
    expect(weekId(Date.UTC(2026, 11, 31))).toBe('2026-W53');
    expect(weekId(Date.UTC(2027, 0, 4))).toBe('2027-W01');
  });

  it('freezes the top three of a finished week', async () => {
    const lastWeek = weekStart(Date.now()) - 86_400_000;
    const week = weekId(lastWeek);
    for (let k = 0; k < 4; k++) {
      const { id } = await pinOk({ code: `dot ${k}, 0, 9`, title: `entry ${k}` }, `198.51.100.${60 + k}`);
      env.DB.raw.prepare('UPDATE pieces SET prompt_week = ?, likes = ? WHERE id = ?').run(week, [5, 9, 1, 7][k], id);
    }
    await finalizeWeek(env, lastWeek);
    await finalizeWeek(env, lastWeek);
    const rows = env.DB.raw.prepare('SELECT rank, likes FROM prompt_winners WHERE week = ? ORDER BY rank').all(week);
    expect(rows.map((r) => ({ ...r }))).toEqual([{ rank: 1, likes: 9 }, { rank: 2, likes: 7 }, { rank: 3, likes: 5 }]);
    const info = (await (await promptInfo(env)).json()) as { last: { winners: Array<{ rank: number }> } };
    expect(info.last.winners.map((w) => w.rank)).toEqual([1, 2, 3]);
  });

  it('does not close the current week early', async () => {
    const { id } = await pinOk({ prompt: true });
    env.DB.raw.prepare('UPDATE pieces SET likes = 3 WHERE id = ?').run(id);
    await finalizeWeek(env, Date.now());
    expect(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM prompt_winners').get()).toEqual({ n: 0 });
  });

  it('shows the stamp on a winning piece', async () => {
    const lastWeek = weekStart(Date.now()) - 86_400_000;
    const { id } = await pinOk({});
    env.DB.raw.prepare('UPDATE pieces SET prompt_week = ?, likes = 4 WHERE id = ?').run(weekId(lastWeek), id);
    await finalizeWeek(env, lastWeek);
    expect(await detail(env, id)).toMatchObject({ stamps: [{ week: weekId(lastWeek), rank: 1, theme: rotationTheme(lastWeek) }] });
  });
});

describe('text filter', () => {
  it.each(['n4zi', 'F.U.C.K', 'shitty', 'whores', 'kill yourself', 'Nígger'])('blocks %j', (s) => {
    expect(blockedWord(s)).not.toBeNull();
  });
  it.each(['spices', 'blue tits at dawn', 'grapes', 'peacock', 'cocky robin', 'Scunthorpe', 'therapist', 'dickens', 'assassin', 'weather'])('allows %j', (s) => {
    expect(blockedWord(s)).toBeNull();
  });
});

describe('server renders', () => {
  it('gives heavy pieces fewer preview frames', () => {
    const r = renderPiece('every frame\n  repeat 6000\n    dot sin(i) * 200, cos(i * t) * 200, 2');
    // 6,001 shapes a frame (with the paper) → 150,000 / 6,001 = 24 frames
    expect(r.frames).toBe(24);
    expect(r.fps).toBe(8);
    expect(r.frames).toBeGreaterThanOrEqual(PIN_BUDGET.minFrames);
  });

  it('refuses pieces that are too heavy for a preview', () => {
    expect(() => renderPiece('every frame\n  repeat 50000\n    x = sin(i)')).toThrow(PinError);
  });

  it('draws a 1200 × 630 OG card', () => {
    const card = ogCard(cardOps(ORBIT), { title: 'a very long title that has to wrap onto more than one line', handle: 'ana', code: ORBIT });
    expect(pngSize(card)).toEqual([1200, 630]);
  });

  it('keeps the theme script in sync with the CSP hash', () => {
    expect(file('../src/partials/head.html').toString()).toContain(`<script>${THEME_SCRIPT}</script>`);
  });
});

vi.setConfig({ testTimeout: 30000 });

describe('content security policy', () => {
  it("lets Cloudflare's analytics beacon load and report, and nothing else from outside", async () => {
    const { securityHeaders } = await import('../src/worker/html.ts');
    const h = new Headers();
    await securityHeaders(h);
    const csp = h.get('content-security-policy')!;
    expect(csp).toMatch(/script-src 'self' 'sha256-[^']+' https:\/\/static\.cloudflareinsights\.com;/);
    expect(csp).toContain("connect-src 'self' https://static.cloudflareinsights.com https://cloudflareinsights.com;");
    expect(csp).toContain("frame-ancestors 'none'");
  });
});
