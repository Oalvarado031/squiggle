import { $, $$, api, boot } from '../lib/ui.ts';
import { pieceCard, type PieceSummary } from '../lib/cards.ts';
import '../styles/cards.css';
import '../styles/wall.css';

boot();

const params = new URLSearchParams(location.search);
const prompt = params.get('prompt');
const sort = prompt ? 'prompt' : params.get('sort') ?? 'new';
for (const a of $$<HTMLAnchorElement>('.tabs a')) if (a.dataset.sort === sort) a.setAttribute('aria-current', 'page');

const host = $('#wall');
const more = $<HTMLButtonElement>('#more');
let cursor: string | null = null;

const EMPTY: Record<string, string> = {
  new: 'Nothing pinned yet. <a href="/studio">Be the first</a>.',
  today: 'No likes yet today. <a href="/wall">See the newest pieces</a> and start some.',
  week: 'No likes yet this week. <a href="/wall">See the newest pieces</a>.',
  prompt: 'No entries yet. <a href="/studio?prompt=1">Draw one for it</a>.',
};

async function load(): Promise<void> {
  more.disabled = true;
  const q = new URLSearchParams({ sort: sort === 'prompt' ? 'new' : sort, limit: '24' });
  if (prompt) q.set('prompt', prompt);
  if (cursor) q.set('cursor', cursor);
  try {
    const r = await api<{ pieces: PieceSummary[]; next: string | null; week?: string }>(`/api/pieces?${q}`);
    if (!cursor && !r.pieces.length) host.innerHTML = `<p class="empty">${EMPTY[sort] ?? EMPTY.new}</p>`;
    host.append(...r.pieces.map(pieceCard));
    cursor = r.next;
    more.hidden = !cursor;
  } catch (e) {
    if (!cursor) host.innerHTML = `<p class="empty">The wall didn't load: ${(e as Error).message}. <a href="/wall">Try again</a>.</p>`;
  } finally {
    more.disabled = false;
  }
}
more.addEventListener('click', () => void load());
void load();
