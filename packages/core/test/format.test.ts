import { describe, expect, it } from 'vitest';
import { tidy, squeeze, Interp, hashOps, postLength, postText, encodeCode, decodeCode, highlight, highlightHtml, svgFrame, drawFrame, type Ctx2D } from '../src/index.ts';

describe('tidy', () => {
  it.each([
    ['dot 1,2,3', 'dot 1, 2, 3\n'],
    ['x=1+2*3', 'x = 1 + 2 * 3\n'],
    ['x = - 3', 'x = -3\n'],
    ['say f( 1 ,2 )', 'say f(1, 2)\n'],
    ['say l [ 0 ]', 'say l [0]\n'],
    ['say p . x', 'say p.x\n'],
    ['repeat 3\n    dot i,0,1', 'repeat 3\n  dot i, 0, 1\n'],
    ['if a\n\tsay 1\nelse\n\tsay 2', 'if a\n  say 1\nelse\n  say 2\n'],
    ['say [1,\n  2]', 'say [1, 2]\n'],
    ['dot 1,2,3   ', 'dot 1, 2, 3\n'],
  ])('%j', (src, want) => {
    expect(tidy(src)).toBe(want);
  });

  it('keeps comments in place', () => {
    expect(tidy('// title\ndot 1,2,3 // a dot\nrepeat 2\n  // inside\n  ring 0,0,i')).toBe('// title\ndot 1, 2, 3 // a dot\nrepeat 2\n  // inside\n  ring 0, 0, i\n');
  });

  it('keeps single blank lines and collapses runs of them', () => {
    expect(tidy('dot 1,2,3\n\n\n\nring 0,0,1')).toBe('dot 1, 2, 3\n\nring 0, 0, 1\n');
  });

  it('keeps the space that makes petal (1, 2) a point argument', () => {
    const src = 'make petal p\n  dot p, 3\npetal (1, 2)';
    expect(tidy(src)).toContain('petal (1, 2)');
    expect(hashOps(new Interp(tidy(src)).frame(0).ops)).toBe(hashOps(new Interp(src).frame(0).ops));
  });

  it('keeps f -5 a call with a negative number', () => {
    expect(tidy('make f a\n  say a\nf -5')).toContain('f -5');
  });

  it('is idempotent', () => {
    const once = tidy('paper ink\nevery frame\n  repeat 48 as i\n    a=i/48*turn+t*.3\n    dot cos(a)*140,sin(a*2)*90,3,hue(i*7)');
    expect(tidy(once)).toBe(once);
  });

  it('refuses code that does not parse', () => {
    expect(() => tidy('repeat 3\ndot 1, 2, 3')).toThrow('repeat needs lines under it');
  });
});

describe('squeeze', () => {
  const art = 'paper ink\nevery frame\n  repeat 48 as i\n    angle = i / 48 * turn + t * 0.30\n    dot cos(angle) * 140, sin(angle * 2) * 90, 3.0, hue(i * 7)';

  it('shortens without changing any frame', () => {
    const r = squeeze(art);
    expect(r.after).toBeLessThan(r.before);
    for (const t of [0, 0.5, 1, 2, 7]) {
      expect(hashOps(new Interp(r.code).frame(t).ops)).toBe(hashOps(new Interp(art).frame(t).ops));
    }
  });

  it('drops spaces, zeros and "as i"', () => {
    expect(squeeze(art).code).toBe('paper ink\nevery frame\n repeat 48\n  a=i/48*turn+t*.3\n  dot cos(a)*140,sin(a*2)*90,3,hue(i*7)');
  });

  it('turns hex colors into palette names or short hex', () => {
    expect(squeeze('paper #15130f\ndot 0, 0, 5, #ff0000').code).toBe('paper ink\ndot 0,0,5,#f00');
  });

  it('never renames to i or t, or to built-in names', () => {
    const r = squeeze('total = 0\nrepeat 3\n  total = total + i\nsay total + t');
    expect(r.code).not.toMatch(/\bi=/);
    expect(new Interp(r.code).frame(0).logs).toEqual(['3']);
  });

  it('leaves member names alone', () => {
    expect(squeeze('pos = (1, 2)\nsay pos.x').code).toBe('a=(1,2)\nsay a.x');
  });

  it('keeps comments out and the piece working', () => {
    const r = squeeze('// hi\ndot 0, 0, 5 // dot');
    expect(r.code).toBe('dot 0,0,5');
  });

  it('keeps interaction working', () => {
    const src = 'count = 0\nwhen key "space"\n  count += 1\nevery frame\n  say count';
    const r = squeeze(src);
    const a = new Interp(src);
    const b = new Interp(r.code);
    a.press('space', 0);
    b.press('space', 0);
    expect(b.frame(0).logs).toEqual(a.frame(0).logs);
  });
});

describe('post length and share links', () => {
  it('counts characters the way X does', () => {
    expect(postLength('dot 0, 0, 5')).toBe(11);
    expect(postLength('write "日本", 0, 0')).toBe(18);
    expect(postLength('say "🙂"')).toBe(8);
  });

  it('ignores trailing spaces and blank lines at the ends', () => {
    expect(postText('\n\ndot 1, 2, 3   \n\n')).toBe('dot 1, 2, 3');
    expect(postLength('a = 1\r\nb = 2\r\n')).toBe(11);
  });

  it('round-trips code through a share payload', async () => {
    const code = 'paper ink\nevery frame\n  dot cos(t) * 100, 0, 20, ember // "quote"\n';
    const payload = await encodeCode(code);
    expect(payload).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(await decodeCode(payload)).toBe(code);
  });

  it('rejects payloads that are not share links', async () => {
    await expect(decodeCode('not a payload!')).rejects.toThrow();
  });
});

describe('highlighting', () => {
  it('classifies every kind of token', () => {
    const cls = Object.fromEntries(highlight('every frame\n  dot 1.5, x, 3, ember // c\nsay "s" + #fff + sin(t)').filter((x) => x.cls !== 'space').map((x) => [x.text, x.cls]));
    expect(cls).toMatchObject({ every: 'keyword', frame: 'keyword', dot: 'command', '1.5': 'number', x: 'name', ember: 'palette', '// c': 'comment', '"s"': 'string', '#fff': 'color', sin: 'builtin', t: 'builtin' });
  });

  it('never throws on half-typed code', () => {
    expect(() => highlight('dot "unfinished\n  ) ] @@ #')).not.toThrow();
  });

  it('escapes HTML', () => {
    expect(highlightHtml('write "<b>", 0, 0')).toContain('&lt;b&gt;');
  });
});

describe('renderers', () => {
  const frame = new Interp('paper ink\nkeep\n  spin 0.3\n  box 0, 0, 40, 20, ember\ndot 0, 0, 5, fade(sky, 0.5)\nwidth 3\nring 0, 0, 30\nline 0, 0, 10, 10\npath [(0, 0), (5, 5)]\nshape [(0, 0), (5, 0), (0, 5)]\nwrite "a<b", 0, 0').frame(0).ops;

  it('writes standalone SVG with every shape', () => {
    const svg = svgFrame(frame, 256);
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="256" height="256"/);
    for (const tag of ['<rect', '<circle', '<line', '<polyline', '<polygon', '<text']) expect(svg).toContain(tag);
    expect(svg).toContain('fill-opacity="0.5"');
    expect(svg).toContain('a&lt;b');
  });

  it('draws through a Canvas2D-like context with a y-up transform', () => {
    const calls: string[] = [];
    const ctx = new Proxy({} as Record<string, unknown>, {
      get: (target, prop: string) => (prop in target ? target[prop] : (...args: unknown[]) => calls.push(`${prop}(${args.map((a) => (typeof a === 'number' ? Math.round(a * 100) / 100 : a)).join(',')})`)),
      set: (target, prop: string, v) => {
        target[prop] = v;
        return true;
      },
    }) as unknown as Ctx2D;
    drawFrame(ctx, frame, 512);
    expect(calls).toContain('setTransform(1,0,0,-1,256,256)');
    expect(calls).toContain('arc(0,0,5,0,6.28)');
    expect(calls).toContain('fillText(a<b,0,0)');
  });
});
