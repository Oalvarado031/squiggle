import { EXAMPLES, POST_LIMIT, codeFitsWithLink, decodeCode, encodeCode, postIntent, postLength, tidy, toErrorInfo, type ErrorInfo, type SqueezeResult, type Warning } from 'squiggle-core';
import { $, api, boot, copy, download, esc, slug, store, toast } from '../lib/ui.ts';
import { Stage, runJob } from '../lib/stage.ts';
import { createEditor, setCode, showProblems } from '../editor/squiggle.ts';
import '../styles/studio.css';

boot();

const params = new URLSearchParams(location.search);
let parentId: string | null = null;
let titleHint = '';

async function initialCode(): Promise<string> {
  const c = params.get('c');
  if (c) {
    try {
      return await decodeCode(c);
    } catch {
      toast("That link didn't contain a piece, so here's a starter");
    }
  }
  const ex = EXAMPLES.find((e) => e.slug === params.get('ex'));
  if (ex) {
    titleHint = ex.title;
    return ex.code;
  }
  const remix = params.get('remix');
  if (remix) {
    try {
      const p = await api<{ piece: { id: string; code: string; title: string } }>(`/api/pieces/${encodeURIComponent(remix)}`);
      parentId = p.piece.id;
      titleHint = `${p.piece.title} (remix)`;
      const note = $('#remix-of');
      note.innerHTML = `remixing <a href="/p/${esc(p.piece.id)}">${esc(p.piece.title)}</a>`;
      note.hidden = false;
      return p.piece.code;
    } catch {
      toast("Couldn't load that piece to remix");
    }
  }
  const draft = store('sq-draft');
  if (draft && draft.trim()) return draft;
  // First visit: the same piece the page already printed (see vite.config.ts).
  const first = EXAMPLES.find((e) => e.slug === 'orbit-garden') ?? EXAMPLES[0];
  titleHint = first.title;
  return first.code;
}

const code0 = await initialCode();
let code = code0;

// ---- starters menu ----
const starter = $<HTMLSelectElement>('#starter');
for (const ex of EXAMPLES) starter.append(new Option(`${ex.title}  ·  ${postLength(ex.code)}`, ex.slug));
starter.addEventListener('change', () => {
  const ex = EXAMPLES.find((e) => e.slug === starter.value);
  if (!ex) return;
  titleHint = ex.title;
  parentId = null;
  $('#remix-of').hidden = true;
  setCode(editor, ex.code);
  stage.restart();
  starter.value = '';
  toast(`${ex.title}: Ctrl+Z brings your code back`);
});

// ---- meter ----
function meter(text: string): void {
  const n = postLength(text);
  const el = $('#meter');
  $('#meter-n').textContent = String(n);
  el.setAttribute('aria-valuenow', String(n));
  el.classList.toggle('near', n > POST_LIMIT * 0.9 && n <= POST_LIMIT);
  el.classList.toggle('over', n > POST_LIMIT);
  $('#meter-fill').style.strokeDasharray = `${Math.min(100, (n / POST_LIMIT) * 100)} 100`;
  $('#stamp').hidden = n > POST_LIMIT || n === 0;
  el.title = n > POST_LIMIT ? `${n - POST_LIMIT} over a post: try Squeeze` : `${POST_LIMIT - n} left in a post`;
}

// ---- problems ----
let problem: ErrorInfo | null = null;
let notes: Warning[] = [];
function showProblem(err: ErrorInfo | null): void {
  problem = err;
  const box = $('#problem');
  showProblems(editor, err, notes);
  if (!err) {
    box.hidden = true;
    return;
  }
  const line = code.split('\n')[err.line - 1] ?? '';
  box.className = `problem${err.kind === 'budget' ? ' budget' : ''}`;
  box.innerHTML = `<span class="where">line ${err.line}, col ${err.col}</span>${esc(err.message)}<pre>${esc(line)}\n${' '.repeat(Math.max(0, err.col - 1))}${'^'.repeat(Math.max(1, Math.min(err.len, line.length - err.col + 1)))}</pre>${err.hint ? `<span class="fix">try: <code>${esc(err.hint)}</code></span>` : ''}`;
  box.hidden = false;
}

function showConsole(logs: string[], warnings: Warning[]): void {
  notes = warnings;
  showProblems(editor, problem, warnings);
  const out = $('#console-out');
  const lines = [...warnings.map((w) => `<span class="note">note, line ${w.line}: ${esc(w.message)}</span>`), ...logs.map(esc)];
  out.innerHTML = lines.join('\n');
  $('#console-count').textContent = lines.length ? String(lines.length) : '';
  if (logs.length && !(window as { __opened?: boolean }).__opened) {
    ($('#console') as HTMLDetailsElement).open = true;
    (window as { __opened?: boolean }).__opened = true;
  }
}

// ---- the stage ----
const playBtn = $<HTMLButtonElement>('#play');
const scrub = $<HTMLInputElement>('#scrub');
const timeOut = $('#time');
let scrubbing = false;
let animated = true;

function setPlayIcon(playing: boolean): void {
  $('#play-icon').setAttribute('d', playing ? 'M8 5h3v14H8zM13 5h3v14h-3z' : 'M8 5l11 7-11 7z');
  playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
}

const stage = new Stage($<HTMLCanvasElement>('#stage'), {
  code: code0,
  keyTarget: $<HTMLCanvasElement>('#stage'),
  onReady(info) {
    animated = info.animated;
    showProblem(null);
    scrub.disabled = !info.animated;
    playBtn.disabled = !info.animated;
    const note = $('#stage-note');
    if (info.interactive) {
      note.textContent = info.keys.length ? `click the canvas, then press ${info.keys.map((k) => (k === 'space' ? 'space' : `“${k}”`)).join(' / ')}` : 'click or tap the canvas';
      note.hidden = false;
      setTimeout(() => (note.hidden = true), 3500);
    } else note.hidden = true;
    if (!info.animated) $('#cost').textContent = 'a still: no every frame';
  },
  onError(err) {
    showProblem(err);
  },
  onTick(t, steps, ms, playing) {
    setPlayIcon(playing);
    if (!scrubbing) {
      if (t > Number(scrub.max)) scrub.max = String(Math.ceil(t / 10) * 10);
      scrub.value = String(t);
    }
    timeOut.textContent = `t = ${t.toFixed(2)}`;
    if (animated) $('#cost').textContent = `${steps.toLocaleString('en-US')} steps · ${ms.toFixed(1)} ms a frame`;
  },
  onLogs: showConsole,
});

playBtn.addEventListener('click', () => setPlayIcon(stage.toggle()));
$('#restart').addEventListener('click', () => {
  scrub.max = '20';
  stage.restart();
});
let wasPlaying = false;
scrub.addEventListener('pointerdown', () => {
  scrubbing = true;
  wasPlaying = stage.playing;
  stage.pause();
});
scrub.addEventListener('input', () => {
  stage.seek(Number(scrub.value));
  timeOut.textContent = `t = ${Number(scrub.value).toFixed(2)}`;
});
const endScrub = () => {
  if (!scrubbing) return;
  scrubbing = false;
  if (wasPlaying) stage.play();
};
scrub.addEventListener('pointerup', endScrub);
scrub.addEventListener('change', endScrub);

// ---- the editor: re-run 150 ms after the last keystroke ----
let timer = 0;
// The page printed the first piece as plain text; it stays on top until the editor has painted.
const standin = document.querySelector('.editor-standin');
if (standin && code0.trimEnd() !== standin.textContent?.trimEnd()) standin.remove();
void document.fonts.ready.then(() => requestAnimationFrame(() => requestAnimationFrame(() => standin?.remove())));
const editor = createEditor({
  parent: $('#editor'),
  doc: code0,
  onChange(text) {
    code = text;
    meter(text);
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      stage.setCode(text);
      store('sq-draft', text);
    }, 150);
  },
});
meter(code0);
if (params.has('c') || params.has('ex') || params.has('remix')) history.replaceState(null, '', location.pathname + (params.get('prompt') ? '?prompt=1' : ''));

document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault();
    stage.restart();
  }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    void shareLink();
  }
});

// ---- tidy and squeeze ----
$('#tidy').addEventListener('click', () => {
  try {
    const out = tidy(code).trimEnd() + '\n';
    if (out === code) return toast('Already tidy');
    setCode(editor, out);
    toast('Tidied');
  } catch (e) {
    showProblem(toErrorInfo(e));
    toast('Fix the problem first, then tidy');
  }
});
$('#squeeze').addEventListener('click', async () => {
  try {
    const r = await runJob<SqueezeResult>({ kind: 'squeeze', code });
    if (r.after >= r.before) return toast("It's already as short as it safely gets");
    setCode(editor, r.code);
    toast(`${r.before} → ${r.after} characters, same art (Ctrl+Z undoes)`);
  } catch (e) {
    const err = (e as { error?: ErrorInfo }).error;
    if (err) showProblem(err);
    toast('Fix the problem first, then squeeze');
  }
});

// ---- share, export, pin ----
async function shareLink(): Promise<void> {
  const url = `${location.origin}/studio?c=${await encodeCode(code)}`;
  await copy(url, 'Link copied: the code is inside it');
}
$('#link').addEventListener('click', () => void shareLink());

const name = () => slug(titleHint || 'squiggle');
$('#png').addEventListener('click', async () => {
  const btn = $<HTMLButtonElement>('#png');
  btn.disabled = true;
  try {
    download(await stage.png(1024, animated ? stage.t : 0), `${name()}.png`);
  } catch (e) {
    toast((e as Error).message);
  } finally {
    btn.disabled = false;
  }
});

$('#clip').addEventListener('click', async () => {
  const btn = $<HTMLButtonElement>('#clip');
  if (!animated) return toast('A still has nothing to film: add every frame');
  btn.disabled = true;
  const label = btn.textContent;
  try {
    const { blob, kind } = await stage.clip(6, (d, total) => (btn.textContent = `Rendering ${Math.round((d / total) * 100)}%`));
    download(blob, `${name()}.${kind}`);
    toast(kind === 'mp4' ? 'Saved a 6-second MP4' : 'Saved a 6-second GIF (this browser has no MP4 encoder)');
  } catch (e) {
    toast(`The clip didn't render: ${(e as Error).message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
});

const dialog = $<HTMLDialogElement>('#pin-dialog');
const pinError = $('#pin-error');
$('#pin').addEventListener('click', () => {
  if (problem) return toast('Fix the problem in the code first');
  $<HTMLInputElement>('#pin-title').value = titleHint;
  $<HTMLInputElement>('#pin-handle').value = store('sq-handle') ?? '';
  $<HTMLInputElement>('#pin-prompt').checked = params.get('prompt') === '1';
  pinError.hidden = true;
  $<HTMLFormElement>('#pin-form').hidden = false;
  $('#pin-done').hidden = true;
  dialog.showModal();
});
$<HTMLFormElement>('#pin-form').addEventListener('submit', async (e) => {
  const submitter = (e as SubmitEvent).submitter as HTMLButtonElement | null;
  if (submitter?.value !== 'pin') return;
  e.preventDefault();
  const form = e.target as HTMLFormElement;
  if (!form.reportValidity()) return;
  const go = $<HTMLButtonElement>('#pin-go');
  go.disabled = true;
  go.textContent = 'Rendering…';
  pinError.hidden = true;
  const handle = $<HTMLInputElement>('#pin-handle').value.trim().replace(/^@/, '');
  store('sq-handle', handle);
  try {
    const title = $<HTMLInputElement>('#pin-title').value.trim();
    const r = await api<{ id: string }>('/api/pieces', {
      method: 'POST',
      body: JSON.stringify({ code, title, handle: handle || null, parent: parentId, prompt: $<HTMLInputElement>('#pin-prompt').checked }),
    });
    store('sq-draft', '');
    // Pinned: offer the post right here. It carries the code itself when the code and the link fit.
    const url = `${location.origin}/p/${r.id}`;
    $<HTMLAnchorElement>('#pin-post').href = postIntent(code, url, `${title}: ${postLength(code)} characters of Squiggle`);
    $<HTMLAnchorElement>('#pin-open').href = `/p/${r.id}`;
    $('#pin-done-note').textContent = codeFitsWithLink(code)
      ? 'The post will be the code itself, with the link under it.'
      : 'The code is too long to share with a link in one post, so the post has the title and the link.';
    $('#pin-copy').onclick = () => copy(url, 'Link copied');
    $<HTMLFormElement>('#pin-form').hidden = true;
    $('#pin-done').hidden = false;
    go.disabled = false;
    go.textContent = 'Pin it';
  } catch (err) {
    const body = (err as { body?: { error?: ErrorInfo } }).body;
    pinError.textContent = (err as Error).message + (body?.error ? `\nline ${body.error.line}: ${body.error.message}` : '');
    pinError.hidden = false;
    go.disabled = false;
    go.textContent = 'Pin it';
  }
});
