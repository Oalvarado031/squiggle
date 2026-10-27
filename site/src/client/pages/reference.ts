import { BLOCKS, COMMANDS, CONSTANTS, FUNCTIONS, PALETTE, PALETTE_NOTES, highlightHtml, type Entry } from 'squiggle-core';
import { $, boot, esc } from '../lib/ui.ts';
import { Stage } from '../lib/stage.ts';
import '../styles/reference.css';

boot();

interface Section {
  id: string;
  title: string;
  intro: string;
  entries?: Entry[];
  html?: string;
}

const group = (g: string) => FUNCTIONS.filter((f) => f.group === g);

const SECTIONS: Section[] = [
  { id: 'shapes', title: 'Shapes', intro: 'Each shape takes its numbers, then an optional color. Anywhere two numbers make an x, y pair, a point like <code>(10, 20)</code> works too.', entries: COMMANDS.filter((c) => c.group === 'shapes') },
  { id: 'style', title: 'Paper, color and width', intro: 'Style commands change everything drawn after them, until the end of the piece or of a <code>keep</code> block.', entries: COMMANDS.filter((c) => c.group === 'style') },
  { id: 'transforms', title: 'Move, spin, grow', intro: 'Transforms stack up: each one is applied inside the ones before it. Wrap them in <code>keep</code> to undo them at the end of a block.', entries: COMMANDS.filter((c) => c.group === 'transforms') },
  { id: 'blocks', title: 'Blocks', intro: 'A line ending in a block word owns the indented lines under it. <code>every frame</code>, <code>when</code> and <code>make</code> go at the top level.', entries: BLOCKS },
  { id: 'values', title: 'Time, turn and the pointer', intro: 'Built-in values you can read anywhere.', entries: CONSTANTS },
  { id: 'math', title: 'Math', intro: 'Angles are in radians: <code>turn</code> is a full circle. <code>rand</code> and <code>noise</code> are seeded, so the same code always draws the same picture.', entries: group('math') },
  { id: 'color', title: 'Making colors', intro: 'Colors blend in OKLab, so mixes stay bright in the middle.', entries: group('color') },
  { id: 'points-lists', title: 'Points and lists', intro: 'Points add and scale like numbers: <code>(1, 2) * 3</code> is <code>(3, 6)</code>. Lists join with <code>+</code> and count from 0.', entries: [...group('points'), ...group('lists')] },
  { id: 'other', title: 'Seed and say', intro: '', entries: COMMANDS.filter((c) => c.group === 'other') },
  {
    id: 'palette', title: 'The palette', intro: 'Named colors you can use anywhere a color goes. They suit both the paper and the night print themes.',
    html: `<div class="palette">${Object.entries(PALETTE).map(([n, hex]) => `<div class="swatch"><div class="chip-color" style="background:${hex}"></div><div><code>${n}</code> <span class="hex">${hex} · ${esc(PALETTE_NOTES[n] ?? '')}</span></div></div>`).join('')}</div>`,
  },
  {
    id: 'syntax', title: 'Values and operators', intro: '',
    html: `<table class="ref-table"><tbody>
<tr><td>12, 0.5, .5, -3</td><td>numbers</td></tr>
<tr><td>"text"</td><td>text; <code>\\"</code> and <code>\\n</code> work inside. <code>+</code> joins text with anything.</td></tr>
<tr><td>[1, 2, 3]</td><td>a list; <code>list[0]</code> is the first item, <code>list[-1]</code> the last</td></tr>
<tr><td>(x, y)</td><td>a point; <code>p.x</code> and <code>p.y</code> read it</td></tr>
<tr><td>#e4572e #e4572e80</td><td>hex colors, with optional see-through amount</td></tr>
<tr><td>+ - * / % ^</td><td>math; <code>%</code> wraps into the positive range and <code>^</code> raises to a power</td></tr>
<tr><td>== != &lt; &gt; &lt;= &gt;=</td><td>comparisons, joined with <code>and</code>, <code>or</code>, <code>not</code></td></tr>
<tr><td>x = 1, x += 2</td><td>store a value; also <code>-=</code>, <code>*=</code>, <code>/=</code></td></tr>
<tr><td>// a note</td><td>a comment</td></tr>
</tbody></table>
<p>Limits: a frame can take 250,000 steps and draw 20,000 shapes; lists hold 10,000 items. A piece that hits a limit stops with a note pointing at the line.</p>`,
  },
];

const toc = $('#toc');
const host = $('#sections');
for (const s of SECTIONS) {
  toc.insertAdjacentHTML('beforeend', `<a class="chip" href="#${s.id}">${esc(s.title)}</a>`);
  const sec = document.createElement('section');
  sec.className = 'ref-section';
  sec.id = s.id;
  sec.innerHTML = `<h2>${esc(s.title)}</h2>${s.intro ? `<p>${s.intro}</p>` : ''}${s.html ?? ''}`;
  if (s.entries) {
    const list = document.createElement('div');
    list.className = 'ref-list';
    for (const e of s.entries) {
      const item = document.createElement('article');
      item.className = 'ref-item';
      item.id = `ref-${e.name.replace(/\s+/g, '-')}`;
      item.innerHTML = `<canvas class="stage" width="128" height="128" aria-label="Example of ${esc(e.name)}"></canvas>
        <div><h3>${esc(e.usage)}</h3><p>${esc(e.summary)}</p>
        <details><summary>example</summary><pre>${highlightHtml(e.example)}</pre><a class="open" href="/studio?c=" data-code="${esc(e.example)}">open in the studio →</a></details></div>`;
      list.append(item);
    }
    sec.append(list);
  }
  host.append(sec);
}

// Live minis: each runs its example in the shared worker, only while on screen.
const entries = SECTIONS.flatMap((s) => s.entries ?? []);
document.querySelectorAll<HTMLCanvasElement>('.ref-item canvas').forEach((c, k) => {
  new Stage(c, { code: entries[k].example, interactive: entries[k].name === 'mouse' || entries[k].name.startsWith('when') });
});

document.addEventListener('click', async (e) => {
  const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a.open');
  if (!a?.dataset.code) return;
  e.preventDefault();
  const { encodeCode } = await import('squiggle-core');
  location.href = `/studio?c=${await encodeCode(a.dataset.code)}`;
});
