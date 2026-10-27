import { describe, expect, it } from 'vitest';
import { Interp, formatError, toErrorInfo, LIMITS } from '../src/index.ts';
import { error } from './helpers.ts';

describe('runtime errors in plain words', () => {
  it.each([
    ['dot 10, 20', 'dot needs 3 numbers: x, y, size (got 2)', 1, 1],
    ['dot 1, 2, 3, 4', 'dot needs 3 numbers: x, y, size (got 4)', 1, 1],
    ['box 0, 0, 10', 'box needs 4 numbers: x, y, w, h (got 3)', 1, 1],
    ['line 0, 0, 1', 'line needs 4 numbers: x1, y1, x2, y2 (got 3)', 1, 1],
    ['move 1', 'move needs 2 numbers: x, y (got 1)', 1, 1],
    ['spin', 'spin needs 1 number: angle (got none)', 1, 1],
    ['dot "a", 2, 3', 'dot got text where it expected a number (x)', 1, 5],
    ['dot 0, 0, ember, 3', 'dot got a color where it expected a number', 1, 11],
    ['dot 0, [1], 3', 'dot got a list where it expected a number (y)', 1, 8],
    ['paper 3', 'paper needs a color, but got a number', 1, 7],
    ['color', 'color needs one color', 1, 1],
    ['path 3', 'path needs a list of points, but got a number', 1, 1],
    ['path [(0, 0), "x"]', 'path needs points, but item 1 is text', 1, 1],
    ['path [0, 0, 5]', 'path got an odd count of numbers, so the last point has no y', 1, 1],
    ['write "a", 0', 'write needs the text, then x and y (got 1 number)', 1, 1],
    ['say nope', 'I don\'t know "nope" yet', 1, 5],
    ['say sinn(1)', 'I don\'t know "sinn" yet', 1, 5],
    ['say 1 + ember', "can't add a number and a color", 1, 5],
    ['say "a" - 1', "can't subtract text and a number", 1, 5],
    ['say [1] + 2', "can't add a number to a list directly", 1, 5],
    ['say 1 < "a"', '< compares numbers, but got a number and text', 1, 5],
    ['say -"a"', "can't put a minus in front of text", 1, 5],
    ['x = 3\nsay x(2)', 'x is a number, not something you can call', 2, 5],
    ['say [1, 2][5]', "this list has 2 items, numbered 0 to 1, so there's no item 5", 2 - 1, 12],
    ['say [][0]', 'this list is empty, so it has no items', 1, 8],
    ['say [1]["a"]', 'a list position must be a number, not text', 1, 9],
    ['say 5[0]', "can't take an item from a number", 1, 5],
    ['say (1, 2).z', 'points have .x and .y, not .z', 1, 5],
    ['say (1, 2)[2]', 'points only have positions 0 and 1', 1, 12],
    ['say 3.x', 'a number has no .x', 1, 5],
    ['say ("a", 1)', 'a point needs numbers, but x is text', 1, 6],
    ['repeat "x"\n  say 1', 'repeat needs a number of times, but got text', 1, 8],
    ['for c in 5\n  say c', 'for needs a list, but got a number', 1, 10],
    ['say sin()', 'sin takes 1 value (got 0)', 1, 5],
    ['say lerp(1, 2)', 'lerp takes 3 values (got 2)', 1, 5],
    ['say hue("red")', 'hue needs a number, but got text', 1, 5],
    ['say mix(1, ember, 0.5)', 'mix needs a color, but got a number', 1, 5],
    ['say lerp("a", "b", 0.5)', 'lerp goes between two numbers, two points or two colors, not text and text', 1, 5],
    ['say dist(1, 2)', 'dist needs two points', 1, 5],
    ['say pick([])', 'pick needs a list with something in it', 1, 5],
    ['say len(4)', 'len needs a list or text, but got a number', 1, 5],
    ['make f a\n  say a\nf', 'f needs 1 value: a (got 0)', 3, 1],
    ['make f\n  say 1\nsay f(2)', "f doesn't take any values (got 1)", 3, 5],
    ['x += 1', 'x has no value yet, so += has nothing to change', 1, 1],
    ['say dot', 'dot is a command, so it goes at the start of a line', 1, 5],
    ['make f\n  dot 0, 0, 1\nsay f() + 1', "can't add nothing and a number", 3, 5],
  ])('%j', (src, message, line, col) => {
    const e = error(src);
    expect(e.kind).toBe('runtime');
    expect(e.message).toBe(message);
    expect([e.line, e.col]).toEqual([line, col]);
  });

  it.each([
    ['dot 10, 20', 'dot x, y, size [, color]'],
    ['say sinn(1)', 'did you mean sin?'],
    ['say mosue', 'did you mean mouse?'],
    ['say randm', 'did you mean rand?'],
    ['say embr', 'did you mean ember?'],
    ['say random', 'Squiggle calls that rand'],
    ['say [1, 2][5]', 'use % len(…) to wrap around, like list[i % len(list)]'],
    ['say 1 + ember', 'to blend colors use mix(a, b, k); to see through one use fade(c, k)'],
    ['dot 0, 0, ember, 3', 'the color goes last: dot x, y, size [, color]'],
    ['make f\n  dot 0, 0, 1\nsay f() + 1', 'a make whose last line is a command gives back nothing; end it with a value'],
  ])('suggests a fix for %j', (src, hint) => {
    expect(error(src).hint).toBe(hint);
  });

  it('suggests names the piece already uses', () => {
    expect(error('radius = 4\nsay radus').hint).toBe('did you mean radius?');
  });

  it('reports errors inside every frame at the frame line', () => {
    expect(error('every frame\n  dot t', 1)).toMatchObject({ line: 2, col: 3, message: 'dot needs 3 numbers: x, y, size (got 1)' });
  });

  it('reports the same setup error on every frame', () => {
    const it2 = new Interp('dot 1\nevery frame\n  dot 0, 0, 1');
    expect(() => it2.frame(0)).toThrow('dot needs 3 numbers');
    expect(() => it2.frame(1)).toThrow('dot needs 3 numbers');
  });
});

describe('error display', () => {
  it('prints line, column, the line, a marker and a fix', () => {
    const code = 'paper ink\nevery frame\n  dot 10, 20';
    expect(formatError(error(code), code)).toBe(
      [
        'line 3, col 3: dot needs 3 numbers: x, y, size (got 2)',
        '  3 |   dot 10, 20',
        '    |   ^^^',
        'try: dot x, y, size [, color]',
      ].join('\n'),
    );
  });

  it('underlines the whole unknown name', () => {
    const code = 'say wobble';
    expect(formatError(error(code), code).split('\n')[2]).toBe('    |     ^^^^^^');
  });

  it('wraps unexpected JavaScript failures in a Squiggle error', () => {
    expect(toErrorInfo(new TypeError('boom'))).toMatchObject({ kind: 'runtime', line: 1, message: expect.stringContaining('boom') });
  });
});

describe('limits', () => {
  it('stops a runaway loop in a frame with a clear note at the loop', () => {
    const e = error('every frame\n  repeat 1000000000\n    x = 1');
    expect(e).toMatchObject({ kind: 'budget', line: 2, col: 3 });
    expect(e.message).toBe(`this frame took more than ${LIMITS.frameSteps.toLocaleString('en-US')} steps, so it was stopped`);
    expect(e.hint).toBe('this loop runs too many times; try a smaller count');
  });

  it('stops a runaway loop outside every frame', () => {
    expect(error('repeat 99999999\n  x = 1')).toMatchObject({ kind: 'budget', message: expect.stringContaining('the lines outside every frame') });
  });

  it('points at the innermost loop', () => {
    expect(error('every frame\n  repeat 10\n    repeat 1000000\n      x = 1')).toMatchObject({ line: 3, col: 5 });
  });

  it('stops endless recursion', () => {
    expect(error('make f n\n  f(n + 1)\nf 0').message).toBe(`f called itself more than ${LIMITS.maxDepth} times deep`);
  });

  it('caps the number of shapes per frame', () => {
    expect(error('repeat 20001\n  dot 0, 0, 1').message).toContain('more than 20,000 shapes');
  });

  it('caps list length', () => {
    expect(error('l = range(10000)\nl = l + [1]').message).toContain('more than 10,000 items');
    expect(error('say range(10001)').message).toContain('longer than 10,000 items');
  });

  it('caps text length', () => {
    expect(error('s = "aaaaaaaaaa"\nrepeat 300\n  s = s + "aaaaaaaaaa"').message).toContain('longer than 2000 characters');
  });

  it('caps the size of a piece', () => {
    expect(() => new Interp('x = 1\n'.repeat(5000))).toThrow('the most Squiggle runs is 20,000');
  });

  it('caps points in a path', () => {
    expect(error('pts = []\nrepeat 5001\n  pts = pts + [(i, 0)]\npath pts').message).toContain('the most is 5,000');
  });

  it('lets custom limits tighten the budget (used for server renders)', () => {
    expect(() => new Interp('every frame\n  repeat 100\n    x = 1', { frameSteps: 50 }).frame(0)).toThrow('more than 50 steps');
  });

  it('runs a heavy but legal frame', () => {
    expect(() => new Interp('every frame\n  repeat 2000\n    dot cos(i) * 200, sin(i) * 200, 2').frame(0)).not.toThrow();
  });
});
