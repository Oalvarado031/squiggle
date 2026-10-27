import { EXAMPLES, POST_LIMIT, highlightHtml, postLength } from 'squiggle-core';
import { $, api, boot, store } from '../lib/ui.ts';
import { Stage } from '../lib/stage.ts';
import { pieceCard, type PieceSummary } from '../lib/cards.ts';
import '../styles/home.css';
import '../styles/cards.css';

boot();

// The hero: a different starter on every visit.
let stage: Stage | null = null;
function showStarter(skip?: string): void {
  const last = skip ?? store('sq-hero-last');
  const pool = EXAMPLES.filter((e) => e.slug !== last);
  const ex = pool[Math.floor(Math.random() * pool.length)] ?? EXAMPLES[0];
  store('sq-hero-last', ex.slug);
  const n = postLength(ex.code);
  $('#hero-title').textContent = ex.title;
  $('#hero-code').innerHTML = highlightHtml(ex.code.trimEnd());
  $('#hero-count').textContent = `${n} / ${POST_LIMIT}`;
  $('#hero-stamp').hidden = n > POST_LIMIT;
  $<HTMLAnchorElement>('#hero-open').href = `/studio?ex=${ex.slug}`;
  if (stage) {
    stage.setCode(ex.code);
    stage.restart();
  } else {
    stage = new Stage($<HTMLCanvasElement>('#hero-stage'), { code: ex.code });
  }
}
showStarter();
$('#hero-next').addEventListener('click', () => showStarter(store('sq-hero-last') ?? undefined));

// Step two runs the code shown in step one.
const stepCode = 'every frame\n  repeat 9\n    ring 0, 0, 20 + i * 24 + sin(t * 2 - i / 2) * 8';
$('#step-code').innerHTML = highlightHtml(stepCode);
new Stage($<HTMLCanvasElement>('#step-stage'), { code: stepCode, interactive: false });
const postCode = 'paper ink\nevery frame\n  repeat 9\n    ring 0, 0, 20 + i * 24 + sin(t * 2 - i / 2) * 8, ember';
$('#post-code').textContent = postCode;
$('#post-count').textContent = `${postLength(postCode)} / ${POST_LIMIT}`;

// A strip of six pieces from the wall: the week's favorites, topped up with the newest.
async function strip(): Promise<void> {
  const host = $('#strip');
  try {
    const week = await api<{ pieces: PieceSummary[] }>('/api/pieces?sort=week&limit=6');
    let list = week.pieces;
    if (list.length < 6) {
      const fresh = await api<{ pieces: PieceSummary[] }>('/api/pieces?sort=new&limit=12');
      for (const p of fresh.pieces) if (list.length < 6 && !list.some((q) => q.id === p.id)) list = [...list, p];
    }
    if (!list.length) {
      host.innerHTML = '<p class="empty">The wall is waiting for its first piece. <a href="/studio">Make one</a>.</p>';
      return;
    }
    host.replaceChildren(...list.map(pieceCard));
  } catch {
    host.innerHTML = '<p class="empty">The wall didn\'t load just now. <a href="/wall">Try the wall</a>.</p>';
  }
}
void strip();
