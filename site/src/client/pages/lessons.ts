import type { Program, Stmt } from 'squiggle-core';
import type { Inspection } from '../lib/protocol.ts';

export interface Check {
  code: string;
  chars: number;
  insp: Inspection;
  program: Program;
  /** frame hashes of the step's starting code, for "same art" goals */
  reference: string[];
}

export interface Lesson {
  title: string;
  body: string;
  code: string;
  goal: string;
  check: (c: Check) => boolean;
}

function walk(body: Stmt[], fn: (s: Stmt) => void): void {
  for (const s of body) {
    fn(s);
    if ('body' in s) walk(s.body, fn);
    if (s.t === 'if' && s.else) walk(s.else, fn);
  }
}

function count(p: Program, pred: (s: Stmt) => boolean): number {
  let n = 0;
  walk(p.body, (s) => {
    if (pred(s)) n++;
  });
  return n;
}

const moves = (c: Check) => c.insp.animated && new Set(c.insp.hashes).size > 1;

export const LESSONS: Lesson[] = [
  {
    title: 'A first dot',
    body: `<p>The sheet is 512 by 512, with <code>0, 0</code> in the middle. x grows to the right and y grows upward, so the corners sit at ±256.</p>
<p><code>dot x, y, size</code> draws a filled circle. The size is its radius in pixels.</p>
<p class="tip">Try <code>dot 200, 200, 20</code> for the top right corner.</p>`,
    code: 'dot 0, 0, 40\n',
    goal: 'Put three dots on the sheet.',
    check: (c) => (c.insp.kinds.dot ?? 0) >= 3,
  },
  {
    title: 'Paper and color',
    body: `<p><code>paper</code> covers the whole sheet, so it usually goes first. <code>color</code> sets the ink for every shape after it, and any shape can take its own color as its last value.</p>
<p>The palette has names: <code>ink</code>, <code>bone</code>, <code>ember</code>, <code>ochre</code>, <code>moss</code>, <code>sea</code>, <code>sky</code>, <code>night</code>, <code>plum</code>, <code>rose</code> and more. You can also write <code>#e4572e</code> or <code>hue(200)</code>.</p>`,
    code: 'paper night\ncolor ochre\ndot 0, 0, 90\ndot 60, 50, 30, ember\n',
    goal: 'Change the paper to something other than night, and use at least three colors.',
    check: (c) => c.insp.papers.length > 0 && !c.insp.papers.includes('#1d2433') && c.insp.colors.length >= 3,
  },
  {
    title: 'repeat',
    body: `<p><code>repeat 12 as i</code> runs the lines indented under it twelve times, while <code>i</code> counts 0, 1, 2 … 11.</p>
<p>Indentation is how Squiggle knows which lines belong to the block. Two spaces is the house style.</p>
<p class="tip">A repeat inside a repeat makes a grid. Give the inner one its own name: <code>repeat 8 as j</code>.</p>`,
    code: 'repeat 5 as i\n  dot i * 60 - 120, 0, 20\n',
    goal: 'Draw at least 30 shapes using repeat.',
    check: (c) => c.insp.shapes >= 30 && count(c.program, (s) => s.t === 'repeat') >= 1,
  },
  {
    title: 'every frame',
    body: `<p>Lines under <code>every frame</code> run again for every frame, and <code>t</code> holds the seconds since the piece started. Feed <code>t</code> into <code>sin</code> and <code>cos</code> to swing things back and forth.</p>
<p>Everything outside <code>every frame</code> runs once and stays underneath, like the paper.</p>`,
    code: 'paper bone\nevery frame\n  dot cos(t) * 150, sin(t * 2) * 60, 30, ember\n',
    goal: 'Make at least two things move.',
    check: (c) => moves(c) && c.insp.shapes >= 2,
  },
  {
    title: 'make',
    body: `<p><code>make</code> gives a group of lines a name, so you can use it like a command. Its inputs come after the name.</p>
<p>The last line of a <code>make</code> is its result, so <code>make sq n</code> with <code>n * n</code> under it also works as a function: <code>sq(4)</code> is 16.</p>`,
    code: 'make flower x, y\n  repeat 6\n    dot x + cos(i) * 22, y + sin(i) * 22, 13, rose\n  dot x, y, 10, ochre\n\nflower 0, 0\n',
    goal: 'Plant a flower at least three times.',
    check: (c) => count(c.program, (s) => s.t === 'make') >= 1 && count(c.program, (s) => s.t === 'callstmt') >= 3,
  },
  {
    title: 'noise',
    body: `<p><code>rand</code> gives a new number every time you ask. <code>noise(x, y, z)</code> gives numbers that drift smoothly as x, y and z change. Slide one of them with <code>t</code> and the whole field ripples.</p>
<p>Both are seeded, so the same code always draws the same thing.</p>`,
    code: 'every frame\n  repeat 60\n    x = i * 8 - 236\n    dot x, noise(i / 10, t) * 120, 4\n',
    goal: 'Use noise to move at least 60 shapes.',
    check: (c) => /\bnoise\s*\(/.test(c.code) && c.insp.shapes >= 60 && moves(c),
  },
  {
    title: 'keep and spin',
    body: `<p><code>move</code>, <code>spin</code> and <code>grow</code> change where everything after them lands. Put them inside <code>keep</code> and they're undone when the block ends, so each pass of a repeat starts again from the middle.</p>
<p>Angles are in radians: <code>turn</code> is a full circle, <code>turn / 4</code> a quarter.</p>`,
    code: 'repeat 12\n  keep\n    spin i * turn / 12\n    box 120, 0, 60, 14, sea\n',
    goal: 'Make a ring of at least 16 spun shapes.',
    check: (c) => c.insp.transformed && c.insp.shapes >= 16 && count(c.program, (s) => s.t === 'keep') >= 1,
  },
  {
    title: 'Clicks and keys',
    body: `<p><code>when click</code> and <code>when key "space"</code> run when someone clicks the canvas or presses a key. They change values but don't draw: drawing happens in <code>every frame</code>, which picks the new values up.</p>
<p><code>mouse</code> holds the pointer's position as a point, so <code>dot mouse, 10</code> follows it.</p>
<p class="tip">Click the canvas first so it hears your keys.</p>`,
    code: 'n = 3\nwhen click\n  n = n + 1\nevery frame\n  repeat n\n    ring 0, 0, 30 + i * 20\n',
    goal: 'Make it answer a key as well as a click.',
    check: (c) => count(c.program, (s) => s.t === 'when' && s.on === 'key') >= 1 && count(c.program, (s) => s.t === 'when' && s.on === 'click') >= 1,
  },
  {
    title: 'Golf tricks',
    body: `<p>A post holds 280 characters. To fit more art in fewer letters:</p>
<ul>
<li>Names can be one letter long.</li>
<li><code>repeat 9</code> without <code>as</code> still counts in <code>i</code>.</li>
<li><code>.5</code> is the same as <code>0.50</code>, and <code>6.0</code> is <code>6</code>.</li>
<li>One space of indent works, and spaces around <code>*</code> and <code>,</code> are optional.</li>
</ul>
<p class="tip">The studio's Squeeze button does all of this for you, and checks that nothing changed.</p>`,
    code: 'paper night\nevery frame\n  repeat 36 as index\n    angle = index / 36 * turn + t * 0.50\n    radius = 120 + sin(t * 2.00 + index * 0.50) * 40\n    dot cos(angle) * radius, sin(angle) * radius, 6.0, hue(index * 10.0)\n',
    goal: 'Get it to 150 characters or fewer, without changing a single pixel.',
    check: (c) => c.chars <= 150 && c.reference.length > 0 && c.insp.hashes.join() === c.reference.join(),
  },
  {
    title: 'Your first post',
    body: `<p>That's the whole language, more or less. Now make something of your own that moves and fits in a post: the meter above the editor counts like X does.</p>
<p>When the goal is met, take it to the studio to pin it to the wall, save a clip, or copy the code straight into a post.</p>`,
    code: 'paper bone\nevery frame\n  ring 0, 0, 100 + sin(t) * 40, ember\n',
    goal: 'Make a moving piece of your own that fits in a post.',
    check: (c) => moves(c) && c.chars <= 280 && c.code.trim() !== 'paper bone\nevery frame\n  ring 0, 0, 100 + sin(t) * 40, ember',
  },
];
