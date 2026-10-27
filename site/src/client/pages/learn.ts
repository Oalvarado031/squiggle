import { encodeCode, parse, postLength, POST_LIMIT, type ErrorInfo } from 'squiggle-core';
import { $, boot, esc, store } from '../lib/ui.ts';
import { Stage, runJob } from '../lib/stage.ts';
import type { Inspection } from '../lib/protocol.ts';
import { createEditor, setCode, showProblems } from '../editor/squiggle.ts';
import { LESSONS } from './lessons.ts';
import '../styles/studio.css';
import '../styles/learn.css';

boot();

const done = new Set<number>(JSON.parse(store('sq-learn') ?? '[]'));
let step = Math.max(0, Math.min(LESSONS.length - 1, Number(location.hash.slice(1)) - 1 || 0));
let reference: string[] = [];
let code = '';
let checkTimer = 0;

const dots = $('#dots');
LESSONS.forEach((l, k) => {
  const a = document.createElement('a');
  a.href = `#${k + 1}`;
  a.textContent = String(k + 1);
  a.title = l.title;
  dots.append(a);
});

function paintDots(): void {
  [...dots.children].forEach((a, k) => {
    a.classList.toggle('done', done.has(k));
    if (k === step) a.setAttribute('aria-current', 'step');
    else a.removeAttribute('aria-current');
  });
}

function showProblem(err: ErrorInfo | null): void {
  showProblems(editor, err);
  const box = $('#problem');
  box.hidden = !err;
  if (err) box.innerHTML = `<span class="where">line ${err.line}, col ${err.col}</span>${esc(err.message)}${err.hint ? `<br><span class="fix">try: <code>${esc(err.hint)}</code></span>` : ''}`;
}

async function check(): Promise<void> {
  const lesson = LESSONS[step];
  const goal = $('#goal');
  try {
    const program = parse(code);
    const insp = await runJob<Inspection>({ kind: 'inspect', code, times: [0, 1] });
    const met = lesson.check({ code, chars: postLength(code), insp, program, reference });
    goal.classList.toggle('met', met);
    if (met && !done.has(step)) {
      done.add(step);
      store('sq-learn', JSON.stringify([...done]));
      paintDots();
    }
    $<HTMLAnchorElement>('#next').textContent = step === LESSONS.length - 1 ? (met ? 'Take it to the studio →' : 'Open the studio →') : met ? 'Next step →' : 'Skip ahead →';
  } catch {
    goal.classList.remove('met');
  }
}

const stage = new Stage($<HTMLCanvasElement>('#stage'), {
  code: '',
  keyTarget: $<HTMLCanvasElement>('#stage'),
  onReady: () => showProblem(null),
  onError: (err) => showProblem(err),
});

const editor = createEditor({
  parent: $('#editor'),
  doc: '',
  label: 'Code for this step',
  onChange(text) {
    code = text;
    store(`sq-learn-${step}`, text);
    $('#chars').textContent = `${postLength(text)} / ${POST_LIMIT}`;
    clearTimeout(checkTimer);
    checkTimer = window.setTimeout(() => {
      stage.setCode(text);
      void check();
    }, 150);
  },
});

async function show(k: number): Promise<void> {
  step = k;
  const lesson = LESSONS[k];
  $('#lesson-n').textContent = `step ${k + 1} of ${LESSONS.length}`;
  $('#lesson-h').textContent = lesson.title;
  $('#lesson-body').innerHTML = lesson.body;
  $('#goal-text').textContent = lesson.goal;
  $('#goal').classList.remove('met');
  document.title = `${k + 1}. ${lesson.title} · Learn Squiggle`;
  const prev = $<HTMLAnchorElement>('#prev');
  prev.href = `#${k}`;
  prev.setAttribute('aria-disabled', String(k === 0));
  const next = $<HTMLAnchorElement>('#next');
  next.href = k === LESSONS.length - 1 ? '/studio' : `#${k + 2}`;
  reference = [];
  try {
    reference = (await runJob<Inspection>({ kind: 'inspect', code: lesson.code, times: [0, 1] })).hashes;
  } catch {
    // the starting code always runs
  }
  const saved = store(`sq-learn-${k}`);
  setCode(editor, saved && saved.trim() ? saved : lesson.code);
  stage.restart();
  paintDots();
}

$('#reset').addEventListener('click', () => {
  setCode(editor, LESSONS[step].code);
  stage.restart();
});

$('#next').addEventListener('click', async (e) => {
  if (step !== LESSONS.length - 1) return;
  e.preventDefault();
  location.href = `/studio?c=${await encodeCode(code)}`;
});

window.addEventListener('hashchange', () => {
  const k = Math.max(0, Math.min(LESSONS.length - 1, Number(location.hash.slice(1)) - 1 || 0));
  if (k !== step) void show(k);
  window.scrollTo({ top: 0 });
});

void show(step);
