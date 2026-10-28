import { POST_LIMIT, highlightHtml, postIntent, postLength, postText } from 'squiggle-core';
import { $, ago, api, boot, copy, esc } from '../lib/ui.ts';
import { Stage } from '../lib/stage.ts';
import { likeButton, pieceCard, type PieceSummary } from '../lib/cards.ts';
import '../styles/cards.css';
import '../styles/piece.css';

boot();

interface PieceDetail extends PieceSummary {
  code: string;
  parent: { id: string; title: string; handle: string | null; house: number } | null;
  remix_list: PieceSummary[];
  stamps: Array<{ week: string; theme: string; rank: number }>;
}

const RANK = ['1st', '2nd', '3rd'];

/** links from squiggle.config.json, sent along with the page */
let siteLinks: { x: string; repo: string } = { x: '', repo: '' };

async function data(): Promise<PieceDetail | null> {
  try {
    const injected = JSON.parse($('#piece-data').textContent || 'null') as { piece: PieceDetail; links?: typeof siteLinks } | null;
    if (injected?.links) siteLinks = injected.links;
    if (injected?.piece) return injected.piece;
  } catch {
    // fall back to the API
  }
  const id = location.pathname.split('/').filter(Boolean)[1];
  if (!id) return null;
  try {
    return (await api<{ piece: PieceDetail }>(`/api/pieces/${encodeURIComponent(id)}`)).piece;
  } catch {
    return null;
  }
}

const p = await data();
if (!p) {
  $('#title').textContent = 'This piece isn’t here';
  $('#byline').innerHTML = 'It may have been taken down. <a href="/wall">Back to the wall</a>.';
  $('#actions').hidden = true;
} else {
  render(p);
}

function render(p: PieceDetail): void {
  const url = `${location.origin}/p/${p.id}`;
  const n = postLength(p.code);
  $('#title').textContent = p.title;
  document.title = `${p.title} · Squiggle`;
  // House pieces never link to an X account we might not own; a person's handle links to their profile.
  const by = p.house
    ? siteLinks.x
      ? `by <a href="${esc(siteLinks.x)}" rel="noopener">squiggle</a>`
      : 'by squiggle'
    : p.handle
      ? `by <a href="https://x.com/${encodeURIComponent(p.handle)}" rel="noopener nofollow">@${esc(p.handle)}</a>`
      : 'by someone who left no name';
  $('#byline').innerHTML = `${by} · ${ago(p.created_at)} · <span class="mono">${n} chars</span>`;

  const stamps = $('#stamps');
  if (n <= POST_LIMIT) stamps.insertAdjacentHTML('beforeend', '<span class="stamp">fits in a post</span>');
  for (const s of p.stamps) stamps.insertAdjacentHTML('beforeend', `<span class="stamp gold">${RANK[s.rank - 1] ?? `#${s.rank}`} · ${esc(s.theme)} · ${esc(s.week.replace(/^\d+-W/, 'week '))}</span>`);
  if (p.interactive) stamps.insertAdjacentHTML('beforeend', '<span class="stamp ink">interactive</span>');

  const family: string[] = [];
  if (p.parent) family.push(`remixed from <a href="/p/${esc(p.parent.id)}">${esc(p.parent.title)}</a>${p.parent.house ? ' by squiggle' : p.parent.handle ? ` by @${esc(p.parent.handle)}` : ''}`);
  if (p.remixes) family.push(`<a href="#remixes">${p.remixes} remix${p.remixes === 1 ? '' : 'es'}</a>`);
  if (family.length) {
    $('#family').innerHTML = family.join(' · ');
    $('#family').hidden = false;
  }

  $('#code').innerHTML = highlightHtml(postText(p.code));
  $('#count').textContent = `${n} / ${POST_LIMIT}`;
  $<HTMLAnchorElement>('#remix').href = `/studio?remix=${p.id}`;
  $('#actions').append(likeButton(p.id, p.likes));

  // Post on X: the code itself, then the link, whenever both fit (X counts a link as 23).
  $<HTMLAnchorElement>('#post').href = postIntent(p.code, url, `${p.title}: ${n} characters of Squiggle`);
  $('#copy-link').addEventListener('click', () => copy(url, 'Link copied'));
  $('#copy-code').addEventListener('click', () => copy(postText(p.code), 'Code copied'));

  const playBtn = $<HTMLButtonElement>('#play');
  const setIcon = (playing: boolean) => {
    $('#play-icon').setAttribute('d', playing ? 'M8 5h3v14H8zM13 5h3v14h-3z' : 'M8 5l11 7-11 7z');
    playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  };
  const stage = new Stage($<HTMLCanvasElement>('#stage'), {
    code: p.code,
    keyTarget: document,
    onReady(info) {
      playBtn.disabled = !info.animated;
      if (info.interactive) {
        const note = $('#interact-note');
        note.textContent = info.keys.length ? `try ${info.keys.map((k) => (k === 'space' ? 'the space bar' : `“${k}”`)).join(', ')}${p.code.includes('when click') ? ' or a click' : ''}` : 'click or tap it';
        note.hidden = false;
      }
    },
    onTick(t, _s, _ms, playing) {
      $('#time').textContent = `t = ${t.toFixed(2)}`;
      setIcon(playing);
    },
  });
  playBtn.addEventListener('click', () => setIcon(stage.toggle()));
  $('#restart').addEventListener('click', () => stage.restart());

  if (p.remix_list.length) {
    $('#remix-cards').replaceChildren(...p.remix_list.map(pieceCard));
    $('#remixes').hidden = false;
  }
}
