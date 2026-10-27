// Same code + same t → same frame. Hashes for every starter and seed at t = 0, 1, 2 are
// pinned in a snapshot: a change to the interpreter that moves a single shape fails here.

import { describe, expect, it } from 'vitest';
import { EXAMPLES, SEEDS, Interp, hashOps, postLength, POST_LIMIT, VOCAB_CHECK } from './determinism-helpers.ts';

const pieces = [...EXAMPLES, ...SEEDS.map((s) => ({ ...s, slug: `seed/${s.slug}` }))];

describe('determinism', () => {
  it('has the starter pieces', () => {
    expect(EXAMPLES.length).toBeGreaterThanOrEqual(1);
    expect(VOCAB_CHECK).toBe(true);
  });

  it.each(pieces.map((p) => [p.slug, p.code]))('%s: frame hashes at t = 0, 1, 2', (slug, code) => {
    const a = new Interp(code);
    const hashes = [0, 1, 2].map((t) => hashOps(a.frame(t).ops));
    // A fresh interpreter, asked in a different order, agrees.
    const b = new Interp(code);
    const reversed = [2, 1, 0].map((t) => hashOps(b.frame(t).ops)).reverse();
    expect(reversed).toEqual(hashes);
    // Rendering other times in between doesn't disturb anything.
    for (const t of [0.123, 5.5, 0.5]) b.frame(t);
    expect([0, 1, 2].map((t) => hashOps(b.frame(t).ops))).toEqual(hashes);
    expect({ slug, hashes }).toMatchSnapshot();
  });

  it.each(pieces.map((p) => [p.slug, p.code]))('%s fits in a post', (_slug, code) => {
    expect(postLength(code)).toBeLessThanOrEqual(POST_LIMIT);
  });
});
