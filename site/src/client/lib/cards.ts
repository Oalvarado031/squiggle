import { api, browserId, esc, playPreview, store, toast, type Preview } from './ui.ts';

export interface PieceSummary {
  id: string;
  title: string;
  handle: string | null;
  /** a house piece, credited to Squiggle itself */
  house: boolean;
  chars: number;
  likes: number;
  remixes: number;
  animated: boolean;
  interactive: boolean;
  created_at: number;
  parent_id: string | null;
  prompt_week: string | null;
  preview: Preview;
}

const HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.2-9.4C1.6 7.6 3.9 4.5 7.2 4.5c2 0 3.5 1.1 4.8 2.9 1.3-1.8 2.8-2.9 4.8-2.9 3.3 0 5.6 3.1 4.4 6.6-1.7 4.8-9.2 9.4-9.2 9.4z"/></svg>';

export function likedSet(): Set<string> {
  try {
    return new Set(JSON.parse(store('sq-liked') ?? '[]'));
  } catch {
    return new Set();
  }
}

function remember(id: string): void {
  const s = likedSet();
  s.add(id);
  store('sq-liked', JSON.stringify([...s].slice(-500)));
}

/** A like button that keeps one like per browser (the server also checks). */
export function likeButton(id: string, count: number): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'like';
  const liked = likedSet().has(id);
  const render = (n: number, on: boolean) => {
    btn.innerHTML = `${HEART}<span>${n}</span>`;
    btn.setAttribute('aria-pressed', String(on));
    btn.setAttribute('aria-label', on ? `Liked, ${n} likes` : `Like, ${n} likes`);
  };
  render(count, liked);
  btn.addEventListener('click', async (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (btn.getAttribute('aria-pressed') === 'true') return;
    render(count + 1, true);
    btn.classList.add('pop');
    try {
      const r = await api<{ likes: number }>(`/api/pieces/${id}/like`, { method: 'POST', body: JSON.stringify({ browser: browserId() }) });
      remember(id);
      render(r.likes, true);
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 409) {
        remember(id);
        return;
      }
      render(count, false);
      toast((e as Error).message);
    }
  });
  return btn;
}

export function pieceCard(p: PieceSummary): HTMLElement {
  const el = document.createElement('article');
  el.className = 'card';
  const by = p.house ? '<span class="by">by squiggle</span>' : p.handle ? `<span class="by">@${esc(p.handle)}</span>` : '<span class="by anon">anonymous</span>';
  el.innerHTML = `
    <a class="card-art" href="/p/${p.id}" aria-label="${esc(p.title)}"><div class="pv" role="img" aria-label="${esc(p.title)}"></div></a>
    <div class="card-meta">
      <div class="card-text">
        <a class="card-title" href="/p/${p.id}">${esc(p.title)}</a>
        <div class="card-sub">${by}<span class="dot-sep">·</span><span class="mono">${p.chars} chars</span>${p.remixes ? `<span class="dot-sep">·</span><span>${p.remixes} remix${p.remixes === 1 ? '' : 'es'}</span>` : ''}</div>
      </div>
    </div>`;
  el.querySelector('.card-meta')!.append(likeButton(p.id, p.likes));
  playPreview(el.querySelector<HTMLElement>('.pv')!, p.preview);
  return el;
}
