import { describe, expect, it } from 'vitest';
import { Interp, Shell, hashOps } from '../src/index.ts';
import { error, logs, ops, said } from './helpers.ts';

describe('values and arithmetic', () => {
  it.each([
    ['1 + 2 * 3', '7'],
    ['(1 + 2) * 3', '9'],
    ['7 / 2', '3.5'],
    ['2 ^ 10', '1024'],
    ['-2 ^ 2', '-4'],
    ['7 % 3', '1'],
    ['-1 % 5', '4'],
    ['5.5 % 2', '1.5'],
    ['1 / 3', '0.3333'],
    ['10 - 2 - 3', '5'],
    ['"a" + 1', 'a1'],
    ['1 + "a"', '1a'],
    ['"x=" + (1, 2)', 'x=(1, 2)'],
    ['[1, 2] + [3]', '[1, 2, 3]'],
    ['(1, 2) + (3, 4)', '(4, 6)'],
    ['(1, 2) - (3, 5)', '(-2, -3)'],
    ['(1, 2) * 3', '(3, 6)'],
    ['2 * (1, 2)', '(2, 4)'],
    ['(2, 3) * (4, 5)', '(8, 15)'],
    ['(4, 6) / 2', '(2, 3)'],
    ['(1, 2) + 1', '(2, 3)'],
    ['-(1, 2)', '(-1, -2)'],
    ['(3, 4).x + (3, 4).y', '7'],
    ['(3, 4)[1]', '4'],
    ['[10, 20, 30][1]', '20'],
    ['[10, 20, 30][-1]', '30'],
    ['[10, 20, 30][1.7]', '20'],
    ['"hello"[1]', 'e'],
    ['1 < 2', 'true'],
    ['2 <= 2', 'true'],
    ['3 > 4', 'false'],
    ['"a" < "b"', 'true'],
    ['1 == 1', 'true'],
    ['[1, (2, 3)] == [1, (2, 3)]', 'true'],
    ['ember == #e4572e', 'true'],
    ['1 != 2', 'true'],
    ['1 < 2 and 2 < 3', 'true'],
    ['1 > 2 or 0', 'false'],
    ['not 0', 'true'],
    ['not [1]', 'false'],
    ['not ""', 'true'],
    ['true and false', 'false'],
  ])('%s → %s', (expr, want) => {
    expect(said(`say ${expr}`)).toBe(want);
  });

  it('stores and updates values', () => {
    expect(said('x = 2\nx += 3\nx *= 4\nx -= 1\nx /= 2\nsay x')).toBe('9.5');
  });

  it('short-circuits and/or', () => {
    expect(said('say false and missing\nsay true or missing')).toBe('true');
  });

  it('shows nested values readably', () => {
    expect(said('say [1, "a", (2, 3), ember, [true]]')).toBe('[1, "a", (2, 3), ember, [true]]');
  });

  it('shows non-palette colors as hex', () => {
    expect(said('say #123456')).toBe('#123456');
  });

  it('joins several say values with spaces', () => {
    expect(said('say "a", 1, (2, 3)')).toBe('a 1 (2, 3)');
  });
});

describe('built-in functions', () => {
  it.each([
    ['floor(2.7)', '2'],
    ['ceil(2.1)', '3'],
    ['round(2.5)', '3'],
    ['abs(-4)', '4'],
    ['sign(-3)', '-1'],
    ['sqrt(16)', '4'],
    ['min(3, 1, 2)', '1'],
    ['max([3, 1, 2])', '3'],
    ['lerp(0, 10, 0.25)', '2.5'],
    ['lerp((0, 0), (10, 20), 0.5)', '(5, 10)'],
    ['clamp(5)', '1'],
    ['clamp(-5, -2, 2)', '-2'],
    ['clamp(5, 10, 0)', '5'],
    ['ease(0)', '0'],
    ['ease(1)', '1'],
    ['ease(0.5)', '0.5'],
    ['ease(2)', '1'],
    ['round(sin(turn / 4))', '1'],
    ['round(cos(pi))', '-1'],
    ['round(atan(1, 0) * 1000)', '1571'],
    ['polar(2, 0)', '(2, 0)'],
    ['dist((0, 0), (3, 4))', '5'],
    ['len([1, 2, 3])', '3'],
    ['len("four")', '4'],
    ['range(4)', '[0, 1, 2, 3]'],
    ['range(0)', '[]'],
    ['hue(0)', '#dd4b4b'],
    ['mix(ink, ink, 0.5)', 'ink'],
    ['mix(ink, paper, 0)', 'ink'],
    ['mix(ink, paper, 1)', 'paper'],
    ['fade(ember, 0.5)', '#e4572e80'],
    ['rgb(255, 0, 0)', '#ff0000'],
    ['rgb(300, -5, 0, 0.5)', '#ff000080'],
    ['ember.r', '228'],
    ['noise(0, 0, 0)', '0'],
  ])('%s → %s', (expr, want) => {
    expect(said(`say ${expr}`)).toBe(want);
  });

  it('keeps noise between -1 and 1 and smooth', () => {
    const vals = logs('repeat 200 as i\n  say noise(i * 0.137, i * 0.071, 3.3)').map(Number);
    expect(Math.max(...vals)).toBeLessThanOrEqual(1);
    expect(Math.min(...vals)).toBeGreaterThanOrEqual(-1);
    const a = Number(said('say noise(1.5, 2.5, 0)'));
    const b = Number(said('say noise(1.501, 2.5, 0)'));
    expect(Math.abs(a - b)).toBeLessThan(0.01);
  });

  it('mixes colors through OKLab (no gray middle)', () => {
    expect(said('say mix(ember, sea, 0.5)')).not.toBe('#808080');
  });

  it('gives rand in the requested ranges', () => {
    const vals = logs('repeat 100\n  say rand(5, 6)').map(Number);
    expect(vals.every((v) => v >= 5 && v < 6)).toBe(true);
    const bare = logs('repeat 50\n  say rand').map(Number);
    expect(bare.every((v) => v >= 0 && v < 1)).toBe(true);
    expect(new Set(bare).size).toBe(50);
  });

  it('picks seeded items', () => {
    expect(logs('repeat 5\n  say pick(["a", "b", "c"])')).toEqual(logs('repeat 5\n  say pick(["a", "b", "c"])'));
  });

  it('lets functions be stored and called later', () => {
    expect(said('f = sin\nsay round(f(turn / 4))')).toBe('1');
  });
});

describe('randomness is seeded', () => {
  it('gives the same numbers for the same code', () => {
    expect(logs('say rand\nsay rand(100)')).toEqual(logs('say rand\nsay rand(100)'));
  });

  it('starts every piece from seed 1, so edits elsewhere keep the art', () => {
    expect(said('say rand')).toBe(said('x = 99 // a different piece\nsay rand'));
  });

  it('changes with seed', () => {
    expect(said('seed 2\nsay rand')).not.toBe(said('say rand'));
    expect(said('seed 2\nsay rand')).toBe(said('seed 2\nsay rand'));
  });

  it('restarts the sequence each frame', () => {
    const it2 = new Interp('every frame\n  say rand');
    expect(it2.frame(0).logs).toEqual(it2.frame(5).logs);
  });

  it('carries a seed set outside every frame into frames', () => {
    const a = new Interp('seed 9\nevery frame\n  say rand').frame(1).logs;
    const b = new Interp('seed 9\nsay rand').frame(0).logs;
    expect(a).toEqual(b);
  });

  it('can be reseeded from t for deliberate flicker', () => {
    const it2 = new Interp('every frame\n  seed floor(t * 4)\n  say rand');
    expect(it2.frame(0).logs).toEqual(it2.frame(0.2).logs);
    expect(it2.frame(0).logs).not.toEqual(it2.frame(0.3).logs);
  });
});

describe('drawing commands', () => {
  it('draws a dot in sheet coordinates', () => {
    expect(ops('dot 10, 20, 5')).toEqual([{ k: 'dot', m: [1, 0, 0, 1, 0, 0], x: 10, y: 20, r: 5, c: '#15130f' }]);
  });

  it('uses an optional last color', () => {
    expect(ops('dot 0, 0, 5, ember')[0]).toMatchObject({ c: '#e4572e' });
  });

  it('accepts points for x, y pairs', () => {
    expect(ops('p = (3, 4)\ndot p, 5')[0]).toMatchObject({ x: 3, y: 4, r: 5 });
    expect(ops('line (0, 0), (10, 10)')[0]).toMatchObject({ x1: 0, y1: 0, x2: 10, y2: 10 });
  });

  it('draws rings with the current width', () => {
    expect(ops('width 6\nring 0, 0, 40')[0]).toMatchObject({ k: 'ring', r: 40, w: 6 });
  });

  it('draws boxes centered on x, y', () => {
    expect(ops('box 1, 2, 30, 40, moss')[0]).toMatchObject({ k: 'box', x: 1, y: 2, w: 30, h: 40, c: '#6f8a4c' });
  });

  it('draws paths from a list of points or numbers', () => {
    expect(ops('path [(0, 0), (10, 0), (10, 10)]')[0]).toMatchObject({ k: 'path', p: [0, 0, 10, 0, 10, 10] });
    expect(ops('path [0, 0, 5, 5]')[0]).toMatchObject({ p: [0, 0, 5, 5] });
    expect(ops('path (0, 0), (5, 5), sea')[0]).toMatchObject({ p: [0, 0, 5, 5], c: '#2f6f73' });
  });

  it('fills shapes', () => {
    expect(ops('shape [(0, 0), (10, 0), (0, 10)], ochre')[0]).toMatchObject({ k: 'shape', c: '#e0a43a' });
  });

  it('skips a path with fewer than two points', () => {
    expect(ops('path [(0, 0)]')).toEqual([]);
  });

  it('writes text with a default size', () => {
    expect(ops('write "hi", 0, 10')[0]).toMatchObject({ k: 'text', s: 'hi', x: 0, y: 10, size: 18 });
    expect(ops('write 42, 0, 0, 30, ember')[0]).toMatchObject({ s: '42', size: 30, c: '#e4572e' });
  });

  it('covers the sheet with paper', () => {
    expect(ops('paper night')).toEqual([{ k: 'paper', c: '#1d2433' }]);
  });

  it('starts every frame on paper-colored paper', () => {
    expect(new Interp('dot 0, 0, 1').frame(0).ops[0]).toEqual({ k: 'paper', c: '#f3eee4' });
  });

  it('sets the color for later shapes', () => {
    expect(ops('color sky\ndot 0, 0, 1\nring 0, 0, 2').map((o) => (o as { c: string }).c)).toEqual(['#86b3d1', '#86b3d1']);
  });

  it('draws see-through colors', () => {
    expect(ops('dot 0, 0, 1, fade(ember, 0.5)')[0]).toMatchObject({ c: 'rgba(228,87,46,0.5)' });
  });

  it('skips zero-size dots and treats negative sizes as positive', () => {
    expect(ops('dot 0, 0, 0')).toEqual([]);
    expect(ops('dot 0, 0, -3')[0]).toMatchObject({ r: 3 });
  });

  it('skips shapes with infinite numbers and leaves a note', () => {
    const f = new Interp('dot 1 / 0, 0, 5').frame(0);
    expect(f.ops).toHaveLength(1);
    expect(f.warnings[0]).toMatchObject({ line: 1, message: expect.stringContaining("isn't finite") });
  });

  it('snaps coordinates to 1/256 px', () => {
    expect(ops('dot 0.123456789, 0, 1')[0]).toMatchObject({ x: Math.round(0.123456789 * 256) / 256 });
  });
});

describe('transforms and keep', () => {
  it('moves later shapes', () => {
    expect(ops('move 10, 20\ndot 0, 0, 1')[0]).toMatchObject({ m: [1, 0, 0, 1, 10, 20] });
  });

  it('spins counter-clockwise (y is up)', () => {
    expect(ops('spin turn / 4\ndot 0, 0, 1')[0]).toMatchObject({ m: [0, 1, -1, 0, 0, 0] });
  });

  it('grows uniformly and with two values', () => {
    expect(ops('grow 2\ndot 0, 0, 1')[0]).toMatchObject({ m: [2, 0, 0, 2, 0, 0] });
    expect(ops('grow 2, 3\ndot 0, 0, 1')[0]).toMatchObject({ m: [2, 0, 0, 3, 0, 0] });
  });

  it('composes move after spin in the spun frame', () => {
    expect(ops('spin turn / 4\nmove 10, 0\ndot 0, 0, 1')[0]).toMatchObject({ m: [0, 1, -1, 0, 0, 10] });
  });

  it('undoes transforms and style at the end of keep', () => {
    const o = ops('keep\n  move 5, 5\n  color ember\n  width 9\n  ring 0, 0, 1\nring 0, 0, 1');
    expect(o[0]).toMatchObject({ m: [1, 0, 0, 1, 5, 5], c: '#e4572e', w: 9 });
    expect(o[1]).toMatchObject({ m: [1, 0, 0, 1, 0, 0], c: '#15130f', w: 2 });
  });

  it('nests keep blocks', () => {
    const o = ops('keep\n  move 1, 0\n  keep\n    move 1, 0\n    dot 0, 0, 1\n  dot 0, 0, 1\ndot 0, 0, 1');
    expect(o.map((x) => (x as { m: number[] }).m[4])).toEqual([2, 1, 0]);
  });
});

describe('blocks', () => {
  it('repeats with a counter', () => {
    expect(logs('repeat 3 as k\n  say k')).toEqual(['0', '1', '2']);
  });

  it('names the counter i when as is left out', () => {
    expect(logs('repeat 3\n  say i')).toEqual(['0', '1', '2']);
  });

  it('gives nested repeats their own counters', () => {
    expect(logs('repeat 2\n  repeat 2\n    say i\n  say "outer " + i')).toEqual(['0', '1', 'outer 0', '0', '1', 'outer 1']);
  });

  it('rounds a fractional count down and skips zero or negative counts', () => {
    expect(logs('repeat 2.9\n  say i')).toEqual(['0', '1']);
    expect(logs('repeat -3\n  say i')).toEqual([]);
  });

  it('loops over lists and text', () => {
    expect(logs('for c in [1, "b"]\n  say c')).toEqual(['1', 'b']);
    expect(logs('for ch in "ab"\n  say ch')).toEqual(['a', 'b']);
  });

  it('keeps values set inside loops', () => {
    expect(said('repeat 4\n  last = i\nsay last')).toBe('3');
  });

  it('branches with if / else if / else', () => {
    const code = (x: number) => `x = ${x}\nif x < 0\n  say "neg"\nelse if x == 0\n  say "zero"\nelse\n  say "pos"`;
    expect([said(code(-1)), said(code(0)), said(code(1))]).toEqual(['neg', 'zero', 'pos']);
  });
});

describe('make', () => {
  it('runs a made command', () => {
    expect(ops('make sun r\n  dot 0, 0, r, ochre\nsun 40')[0]).toMatchObject({ r: 40, c: '#e0a43a' });
  });

  it('returns its last line as a value', () => {
    expect(said('make sq n\n  n * n\nsay sq(7)')).toBe('49');
  });

  it('returns the value of an if as its last line', () => {
    expect(said('make sgn x\n  if x < 0\n    -1\n  else\n    1\nsay sgn(-4) + sgn(3)')).toBe('0');
  });

  it('can recurse', () => {
    expect(said('make fact n\n  if n < 2\n    1\n  else\n    n * fact(n - 1)\nsay fact(6)')).toBe('720');
  });

  it('can draw a recursive tree', () => {
    const code = 'make branch n\n  if n > 0\n    line 0, 0, 0, 40\n    keep\n      move 0, 40\n      spin 0.4\n      branch n - 1\n    keep\n      move 0, 40\n      spin -0.4\n      branch n - 1\nbranch 5';
    expect(ops(code)).toHaveLength(31);
  });

  it('keeps new names local', () => {
    expect(error('make f\n  inner = 1\nf\nsay inner').message).toBe('I don\'t know "inner" yet');
  });

  it('shares names that already exist at the top level', () => {
    expect(said('n = 0\nmake bump\n  n += 1\nbump\nbump\nsay n')).toBe('2');
  });

  it('gives parameters their own value even when a global has the same name', () => {
    expect(said('a = 1\nmake f a\n  a * 10\nsay f(5) + a')).toBe('51');
  });

  it('can be called with parentheses as a statement', () => {
    expect(ops('make d x\n  dot x, 0, 1\nd(5)')[0]).toMatchObject({ x: 5 });
  });

  it('returns nothing when its last line is a command', () => {
    expect(said('make f\n  dot 0, 0, 1\nsay f()')).toBe('none');
  });
});

describe('frames and time', () => {
  it('draws a still when there is no every frame', () => {
    const it2 = new Interp('dot 0, 0, 5');
    expect(it2.animated).toBe(false);
    expect(hashOps(it2.frame(0).ops)).toBe(hashOps(it2.frame(10).ops));
  });

  it('gives t in seconds inside every frame', () => {
    const it2 = new Interp('every frame\n  say t');
    expect(it2.frame(2.5).logs).toEqual(['2.5']);
  });

  it('keeps t at 0 outside every frame', () => {
    expect(new Interp('say t\nevery frame\n  dot 0, 0, 1').frame(3).logs).toEqual(['0']);
  });

  it('draws the lines outside every frame under each frame', () => {
    const o = new Interp('paper ink\ndot 0, 0, 50\nevery frame\n  dot 0, 0, 10, ember').frame(1).ops;
    expect(o.map((x) => x.k)).toEqual(['paper', 'paper', 'dot', 'dot']);
  });

  it('starts each frame from the top-level values (frames are pure)', () => {
    const it2 = new Interp('n = 0\nevery frame\n  n += 1\n  say n');
    expect(it2.frame(0).logs).toEqual(['1']);
    expect(it2.frame(1).logs).toEqual(['1']);
  });

  it('gives the same frame for the same t in any order', () => {
    const code = 'every frame\n  repeat 10\n    dot cos(t + i) * 100, sin(t * 2 + i) * 100, 4 + rand(4)';
    const a = new Interp(code);
    const b = new Interp(code);
    const fwd = [0, 1, 2].map((t) => hashOps(a.frame(t).ops));
    const back = [2, 1, 0].map((t) => hashOps(b.frame(t).ops)).reverse();
    expect(fwd).toEqual(back);
  });

  it('carries color and width from setup into frames', () => {
    expect(new Interp('color moss\nwidth 5\nevery frame\n  ring 0, 0, 9').frame(0).ops[1]).toMatchObject({ c: '#6f8a4c', w: 5 });
  });

  it('lets several every frame blocks run in order', () => {
    expect(new Interp('every frame\n  say 1\nevery frame\n  say 2').frame(0).logs).toEqual(['1', '2']);
  });

  it('reads the mouse position', () => {
    const it2 = new Interp('every frame\n  say mouse');
    expect(it2.frame(0, { x: 10, y: -20 }).logs).toEqual(['(10, -20)']);
  });
});

describe('interaction', () => {
  it('runs when click with the click position and keeps its changes', () => {
    const it2 = new Interp('at = (0, 0)\nwhen click\n  at = mouse\nevery frame\n  dot at, 5');
    expect(it2.interactive).toBe(true);
    it2.click(30, 40, 1);
    expect(it2.frame(2).ops[1]).toMatchObject({ x: 30, y: 40 });
  });

  it('runs when key handlers and counts presses', () => {
    const it2 = new Interp('n = 0\nwhen key "space"\n  n += 1\nevery frame\n  say n');
    it2.press('space', 0);
    it2.press(' '.trim() || 'space', 0);
    expect(it2.frame(0).logs).toEqual(['2']);
  });

  it('ignores keys it does not listen for', () => {
    const it2 = new Interp('when key "a"\n  x = 1\nevery frame\n  dot 0, 0, 1');
    expect(it2.press('b', 0)).toBe(false);
    expect(it2.press('A', 0)).toBe(true);
    expect(it2.keys).toEqual(['a']);
  });

  it('can start an animation from the click time', () => {
    const it2 = new Interp('from = -100\nwhen click\n  from = t\nevery frame\n  say t - from');
    it2.click(0, 0, 3);
    expect(it2.frame(4).logs).toEqual(['1']);
  });

  it('refuses to draw inside when', () => {
    const it2 = new Interp('when click\n  dot 0, 0, 5\nevery frame\n  dot 0, 0, 1');
    expect(() => it2.click(0, 0, 0)).toThrow("dot can't draw inside a when block");
  });
});

describe('shell', () => {
  it('prints expression values and keeps names between chunks', () => {
    const sh = new Shell();
    expect(sh.run('x = 4').text).toBe('');
    expect(sh.run('x * 10').text).toBe('40');
  });

  it('remembers made commands between chunks', () => {
    const sh = new Shell();
    sh.run('make twice n\n  n * 2');
    expect(sh.run('twice(21)').text).toBe('42');
  });

  it('returns say output as logs', () => {
    expect(new Shell().run('say "hi"').logs).toEqual(['hi']);
  });
});
