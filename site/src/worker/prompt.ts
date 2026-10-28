// One theme a week, Monday to Monday (UTC). The rotation starts with "weather" on the
// week of 2026-10-26; a row in the prompts table overrides any week.

import type { Env } from './env.ts';

export const THEMES = [
  'weather', 'machines', 'tides', 'growth', 'night', 'rhythm', 'maps', 'insects', 'fire', 'stacks',
  'orbits', 'letters', 'gardens', 'signals', 'crowds', 'knots', 'ice', 'clocks', 'birds', 'rooms',
];

const DAY = 86_400_000;
const ANCHOR = Date.UTC(2026, 9, 26); // a Monday

export function weekStart(ms: number): number {
  const d = new Date(ms);
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - day * DAY;
}

/** ISO week id, like 2026-W44 */
export function weekId(ms: number): string {
  const d = new Date(weekStart(ms) + 3 * DAY); // the week's Thursday decides its year
  const year = d.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(year, 0, 4));
  const week1 = weekStart(firstThursday.getTime());
  const n = Math.round((weekStart(ms) - week1) / (7 * DAY)) + 1;
  return `${year}-W${String(n).padStart(2, '0')}`;
}

export function rotationTheme(ms: number): string {
  const k = Math.floor((weekStart(ms) - ANCHOR) / (7 * DAY));
  return THEMES[((k % THEMES.length) + THEMES.length) % THEMES.length];
}

// Every page shows the theme, so remember the answer for a minute per isolate.
const themeCache = new Map<string, { theme: string; until: number }>();

export async function themeFor(env: Env, ms: number): Promise<string> {
  const week = weekId(ms);
  const hit = themeCache.get(week);
  if (hit && hit.until > Date.now()) return hit.theme;
  let theme = rotationTheme(ms);
  try {
    const row = await env.DB.prepare('SELECT theme FROM prompts WHERE week = ?').bind(week).first<{ theme: string }>();
    if (row?.theme) theme = row.theme;
  } catch {
    // the rotation is the fallback
  }
  themeCache.set(week, { theme, until: Date.now() + 60_000 });
  return theme;
}

/** Freezes the top three of a finished week. Safe to call more than once. */
export async function finalizeWeek(env: Env, ms: number): Promise<void> {
  const week = weekId(ms);
  if (weekStart(ms) + 7 * DAY > Date.now()) return; // not over yet
  const done = await env.DB.prepare('SELECT COUNT(*) AS n FROM prompt_winners WHERE week = ?').bind(week).first<{ n: number }>();
  if (done && done.n > 0) return;
  // House pieces open the prompt but don't compete for its stamps.
  const top = await env.DB.prepare('SELECT id, likes FROM pieces WHERE prompt_week = ? AND hidden = 0 AND house = 0 AND likes > 0 ORDER BY likes DESC, created_at ASC LIMIT 3')
    .bind(week)
    .all<{ id: string; likes: number }>();
  if (!top.results.length) return;
  await env.DB.batch(
    top.results.map((r, k) => env.DB.prepare('INSERT OR IGNORE INTO prompt_winners (week, rank, piece_id, likes) VALUES (?, ?, ?, ?)').bind(week, k + 1, r.id, r.likes)),
  );
}

export function weekTimes(week: string): number | null {
  const m = /^(\d{4})-W(\d{2})$/.exec(week);
  if (!m) return null;
  const jan4 = Date.UTC(Number(m[1]), 0, 4);
  return weekStart(jan4) + (Number(m[2]) - 1) * 7 * DAY;
}
