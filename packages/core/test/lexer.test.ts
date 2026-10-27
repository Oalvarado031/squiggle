import { describe, expect, it } from 'vitest';
import { lex } from '../src/lexer.ts';

const types = (src: string) => lex(src).tokens.map((t) => (t.type === 'op' || t.type === 'name' ? t.text : t.type));

describe('lexer: tokens', () => {
  it.each([
    ['dot 1, 2, 3', ['dot', 'num', ',', 'num', ',', 'num', 'newline', 'eof']],
    ['x = .5', ['x', '=', 'num', 'newline', 'eof']],
    ['a += 2', ['a', '+=', 'num', 'newline', 'eof']],
    ['a <= b', ['a', '<=', 'b', 'newline', 'eof']],
    ['a != b', ['a', '!=', 'b', 'newline', 'eof']],
    ['color #e4572e', ['color', 'color', 'newline', 'eof']],
    ['write "hi", 0, 0', ['write', 'str', ',', 'num', ',', 'num', 'newline', 'eof']],
    ['p.x', ['p', '.', 'x', 'newline', 'eof']],
    ['l[0]', ['l', '[', 'num', ']', 'newline', 'eof']],
    ['dot 1, 2, 3 // note', ['dot', 'num', ',', 'num', ',', 'num', 'newline', 'eof']],
  ])('%s', (src, want) => {
    expect(types(src)).toEqual(want);
  });

  it('reads number values', () => {
    const vals = lex('1 2.5 .25 100').tokens.filter((t) => t.type === 'num').map((t) => t.value);
    expect(vals).toEqual([1, 2.5, 0.25, 100]);
  });

  it('reads string escapes', () => {
    const s = lex('say "a\\"b\\nc"').tokens.find((t) => t.type === 'str');
    expect(s?.value).toBe('a"b\nc');
  });

  it('lowercases hex colors', () => {
    expect(lex('color #E4572E').tokens[1].value).toBe('e4572e');
  });

  it('records whether a token has space before it', () => {
    const toks = lex('f(1) g (2)').tokens;
    expect(toks[1].space).toBe(false);
    expect(toks[5].space).toBe(true);
  });

  it('keeps comments with their lines', () => {
    const { comments } = lex('// top\ndot 0, 0, 5 // end');
    expect(comments).toEqual([
      { line: 1, col: 1, text: ' top', own: true },
      { line: 2, col: 13, text: ' end', own: false },
    ]);
  });
});

describe('lexer: indentation', () => {
  it('emits indent and dedent around a block', () => {
    expect(types('repeat 2\n  dot 1, 2, 3\nsay 1')).toEqual([
      'repeat', 'num', 'newline', 'indent', 'dot', 'num', ',', 'num', ',', 'num', 'newline', 'dedent', 'say', 'num', 'newline', 'eof',
    ]);
  });

  it('closes every open block at the end', () => {
    const t = types('every frame\n  repeat 2\n    say 1');
    expect(t.filter((x) => x === 'dedent')).toHaveLength(2);
  });

  it('dedents several levels at once', () => {
    const t = types('if 1\n  if 1\n    say 1\nsay 2');
    expect(t.slice(t.indexOf('dedent'), t.indexOf('dedent') + 2)).toEqual(['dedent', 'dedent']);
  });

  it('ignores blank and comment-only lines for indentation', () => {
    expect(() => lex('repeat 2\n\n  // hi\n  say 1\n\nsay 2')).not.toThrow();
  });

  it('accepts four-space and one-space indents', () => {
    expect(() => lex('repeat 2\n    say 1')).not.toThrow();
    expect(() => lex('repeat 2\n say 1')).not.toThrow();
  });

  it('treats non-breaking spaces (from pasted posts) as spaces', () => {
    expect(types('repeat 2\n  say 1')).toContain('indent');
  });

  it('accepts tabs when used consistently', () => {
    expect(() => lex('repeat 2\n\tsay 1\n\tsay 2')).not.toThrow();
  });

  it('continues lines inside brackets', () => {
    expect(types('say [1,\n  2,\n  3]')).toEqual(['say', '[', 'num', ',', 'num', ',', 'num', ']', 'newline', 'eof']);
  });

  it('accepts CRLF line endings', () => {
    expect(types('repeat 2\r\n  say 1\r\n')).toContain('indent');
  });
});

describe('lexer: errors', () => {
  const err = (src: string) => {
    try {
      lex(src);
    } catch (e) {
      return e as { message: string; line: number; col: number; hint?: string };
    }
    throw new Error('no error');
  };

  it.each([
    ['say "open', 'this text never ends', 1, 5],
    ['color #12', '"#12" isn\'t a color', 1, 7],
    ['color #ggg', '"#ggg" isn\'t a color', 1, 7],
    ['x = 3a', '"3a" starts like a number but has letters stuck to it', 1, 5],
    ["say 'a'", 'Squiggle doesn\'t use "\'"', 1, 5],
    ['say (1', 'this ( is never closed', 1, 5],
    ['say 1)', "there's a ) here with nothing to close", 1, 6],
    ['say (1]', "this ] doesn't match the ( on line 1", 1, 7],
    ['repeat 2\n    say 1\n  say 2', "this line's indent doesn't line up with any block above it", 3, 1],
    ['repeat 2\n  say 1\n\tsay 2', 'this indent mixes tabs and spaces', 3, 1],
    ['x = 1 ; y = 2', 'Squiggle doesn\'t use ";"', 1, 7],
    ['if x {', 'Squiggle doesn\'t use "{"', 1, 6],
  ])('%j', (src, message, line, col) => {
    const e = err(src);
    expect(e.message).toBe(message);
    expect([e.line, e.col]).toEqual([line, col]);
  });

  it('suggests a fix for a colon after a block', () => {
    expect(err('repeat 3:').hint).toMatch(/don't need a colon/);
  });
});
