import { describe, expect, it } from 'vitest';
import { parse, type Stmt } from '../src/parser.ts';
import { error } from './helpers.ts';

const kinds = (body: Stmt[]): unknown[] =>
  body.map((s) => {
    switch (s.t) {
      case 'every': case 'keep': case 'when':
        return [s.t, kinds(s.body)];
      case 'repeat': return ['repeat', s.as ?? null, kinds(s.body)];
      case 'for': return ['for', s.as, kinds(s.body)];
      case 'if': return ['if', kinds(s.body), s.else ? kinds(s.else) : null];
      case 'make': return ['make', s.name, s.params, kinds(s.body)];
      case 'cmd': case 'callstmt': return [s.t, s.name, s.args.length];
      case 'assign': return ['assign', s.name, s.op];
      default: return [s.t];
    }
  });

const shape = (src: string) => kinds(parse(src).body);

describe('parser: statements and blocks', () => {
  it('reads commands with their arguments', () => {
    expect(shape('dot 1, 2, 3\nring 0, 0, 5, ember')).toEqual([['cmd', 'dot', 3], ['cmd', 'ring', 4]]);
  });

  it('accepts commands written with parentheses', () => {
    expect(shape('dot(1, 2, 3)')).toEqual([['cmd', 'dot', 3]]);
  });

  it('reads a point argument that starts the line', () => {
    expect(shape('dot (1, 2), 3')).toEqual([['cmd', 'dot', 2]]);
  });

  it('reads assignments and compound assignments', () => {
    expect(shape('x = 1\nx += 2\nx -= 1\nx *= 3\nx /= 2')).toEqual([
      ['assign', 'x', '='], ['assign', 'x', '+='], ['assign', 'x', '-='], ['assign', 'x', '*='], ['assign', 'x', '/='],
    ]);
  });

  it('reads every frame with its body', () => {
    expect(shape('every frame\n  dot 0, 0, t')).toEqual([['every', [['cmd', 'dot', 3]]]]);
  });

  it('reads repeat with and without as', () => {
    expect(shape('repeat 3 as k\n  say k\nrepeat 2\n  say i')).toEqual([
      ['repeat', 'k', [['cmd', 'say', 1]]],
      ['repeat', null, [['cmd', 'say', 1]]],
    ]);
  });

  it('reads for … in', () => {
    expect(shape('for c in [1, 2]\n  say c')).toEqual([['for', 'c', [['cmd', 'say', 1]]]]);
  });

  it('reads if / else if / else chains', () => {
    expect(shape('if a\n  say 1\nelse if b\n  say 2\nelse\n  say 3')).toEqual([
      ['if', [['cmd', 'say', 1]], [['if', [['cmd', 'say', 1]], [['cmd', 'say', 1]]]]],
    ]);
  });

  it('reads nested blocks three deep', () => {
    expect(shape('every frame\n  repeat 2\n    keep\n      dot 0, 0, 1')).toEqual([
      ['every', [['repeat', null, [['keep', [['cmd', 'dot', 3]]]]]]],
    ]);
  });

  it('reads make with parameters and calls before the definition', () => {
    expect(shape('petal 1, 2\nmake petal a, b\n  dot a, b, 3')).toEqual([
      ['callstmt', 'petal', 2],
      ['make', 'petal', ['a', 'b'], [['cmd', 'dot', 3]]],
    ]);
  });

  it('reads make without parameters, called bare', () => {
    expect(shape('make sun\n  dot 0, 0, 40\nsun')).toEqual([['make', 'sun', [], [['cmd', 'dot', 3]]], ['callstmt', 'sun', 0]]);
  });

  it('reads a function call with negative first argument as a command call', () => {
    expect(shape('make f a\n  say a\nf -5')).toEqual([['make', 'f', ['a'], [['cmd', 'say', 1]]], ['callstmt', 'f', 1]]);
  });

  it('reads when key and when click', () => {
    const p = parse('when key "SPACE"\n  x = 1\nwhen click\n  x = 2');
    expect(kinds(p.body)).toEqual([['when', [['assign', 'x', '=']]], ['when', [['assign', 'x', '=']]]]);
    expect(p.body[0]).toMatchObject({ on: 'key', key: 'space' });
    expect(p.body[1]).toMatchObject({ on: 'click' });
  });

  it('maps key aliases', () => {
    expect(parse('when key "ArrowLeft"\n  x = 1').body[0]).toMatchObject({ key: 'left' });
  });

  it('keeps expression statements (a make\'s result)', () => {
    expect(shape('make sq n\n  n * n')).toEqual([['make', 'sq', ['n'], [['expr']]]]);
  });

  it('skips blank lines and comments between statements', () => {
    expect(shape('// a\n\ndot 0, 0, 1\n\n// b\nring 0, 0, 2 // c\n')).toEqual([['cmd', 'dot', 3], ['cmd', 'ring', 3]]);
  });
});

describe('parser: expressions', () => {
  const expr = (src: string) => {
    const st = parse(`x = ${src}`).body[0];
    return st.t === 'assign' ? st.value : null;
  };

  it('gives * precedence over +', () => {
    expect(expr('1 + 2 * 3')).toMatchObject({ t: 'bin', op: '+', b: { t: 'bin', op: '*' } });
  });

  it('makes ^ bind tighter than unary minus on its left', () => {
    expect(expr('-2 ^ 2')).toMatchObject({ t: 'un', op: '-', a: { t: 'bin', op: '^' } });
  });

  it('makes ^ right-associative', () => {
    expect(expr('2 ^ 3 ^ 2')).toMatchObject({ t: 'bin', op: '^', b: { t: 'bin', op: '^' } });
  });

  it('reads points and lists', () => {
    expect(expr('(1, 2)')).toMatchObject({ t: 'point' });
    expect(expr('[1, (2, 3), [4]]')).toMatchObject({ t: 'list', items: [{ t: 'num' }, { t: 'point' }, { t: 'list' }] });
  });

  it('allows a trailing comma in a list', () => {
    expect(expr('[1, 2,]')).toMatchObject({ t: 'list', items: [{}, {}] });
  });

  it('reads calls, indexes and members in a chain', () => {
    expect(expr('f(1)[0].x')).toMatchObject({ t: 'member', name: 'x', obj: { t: 'index', obj: { t: 'call' } } });
  });

  it('reads not, and, or with the right precedence', () => {
    expect(expr('not a and b or c')).toMatchObject({ t: 'bin', op: 'or', a: { t: 'bin', op: 'and', a: { t: 'un', op: 'not' } } });
  });

  it('folds a minus on a number into the number', () => {
    expect(expr('-3')).toEqual({ t: 'num', v: -3, pos: expect.anything() });
  });

  it('reads true and false', () => {
    expect(expr('true')).toMatchObject({ t: 'bool', v: true });
  });

  it('records positions for error underlines', () => {
    expect(expr('1 + foo')).toMatchObject({ b: { pos: { line: 1, col: 9, len: 3 } } });
  });
});

describe('parser: errors in plain words', () => {
  it.each([
    ['repeat 3\ndot 1, 2, 3', 'repeat needs lines under it, indented', 1, 1],
    ['repeat\n  say 1', 'repeat needs to know how many times', 1, 1],
    ['x = 3\n  say x', "this line is indented, but the line above doesn't start a block", 2, 1],
    ['else\n  say 1', 'this else has no if right above it', 1, 1],
    ['every\n  say 1', 'every is always followed by frame', 1, 6],
    ['repeat 2\n  every frame\n    say 1', 'every frame goes at the top level, not inside another block', 2, 3],
    ['if 1\n  make f\n    say 1', 'make goes at the top level, not inside another block', 2, 3],
    ['repeat 2\n  when click\n    x = 1', 'when goes at the top level, not inside another block', 2, 3],
    ['when key space\n  x = 1', 'when key needs the key in quotes', 1, 10],
    ['when key "spacebar"\n  x = 1', 'I don\'t know the key "spacebar"', 1, 10],
    ['when tap\n  x = 1', 'when is followed by key or click', 1, 6],
    ['circle 0, 0, 5', 'I don\'t know a command called "circle"', 1, 1],
    ['dot 1, 2, 3,', "there's a comma after the last value of dot", 1, 13],
    ['x =', 'x = needs a value after it', 1, 4],
    ['dot = 3', 'dot is already a command', 1, 1],
    ['t = 3', "t is the clock, so it can't be used as a name", 1, 1],
    ['ember = 3', "ember is a palette color, so it can't be used as a name", 1, 1],
    ['sin = 3', "sin is built in, so it can't be used as a name", 1, 1],
    ['repeat 3 as frame\n  say 1', "frame is a Squiggle word, so it can't be used as a name", 1, 13],
    ['make f a, a\n  say a', 'a is listed twice', 1, 11],
    ['make f(a)\n  say a', 'make lists its inputs without brackets', 1, 7],
    ['if x = 3\n  say 1', 'a single = stores a value', 1, 6],
    ['say 1 < 2 < 3', 'compare two things at a time', 1, 11],
    ['say (1, 2, 3)', 'points have two values: (x, y)', 1, 10],
    ['for c [1, 2]\n  say c', 'for needs "in" and a list', 1, 7],
    ['say 1 2', "didn't expect the number 2 after say", 1, 7],
    ['sin 3', 'sin gives back a value, so it goes inside a line, not at the start', 1, 1],
    ['frame', 'frame on its own does nothing', 1, 1],
    ['x = repeat', "repeat can't be used inside a value", 1, 5],
  ])('%j', (src, message, line, col) => {
    const e = error(src);
    expect(e.kind).toBe('syntax');
    expect(e.message).toBe(message);
    expect([e.line, e.col]).toEqual([line, col]);
  });

  it.each([
    ['circle 0, 0, 5', /dot \(filled\) or ring \(outline\)/],
    ['rect 0, 0, 5, 5', /box/],
    ['background ink', /paper/],
    ['rotate 1', /spin/],
    ['dto 0, 0, 5', /did you mean dot\?/],
    ['repeat 3\ndot 1, 2, 3', /indent the lines/],
    ['if x = 3\n  say 1', /use ==/],
  ])('suggests a fix for %j', (src, hint) => {
    expect(error(src).hint).toMatch(hint);
  });
});
