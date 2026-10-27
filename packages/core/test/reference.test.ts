import { describe, expect, it } from 'vitest';
import { BLOCKS, COMMANDS, CONSTANTS, FUNCTIONS, Interp } from '../src/index.ts';

// /reference shows every one of these as a live mini piece, so each must run cleanly.
describe('reference examples run', () => {
  it.each([...COMMANDS, ...BLOCKS, ...FUNCTIONS, ...CONSTANTS].map((e) => [e.name, e.example]))('%s', (_name, code) => {
    const it2 = new Interp(code);
    for (const t of [0, 1.3]) {
      const f = it2.frame(t, { x: 40, y: 30 });
      expect(f.warnings).toEqual([]);
      expect(f.ops.length).toBeGreaterThan(1);
    }
  });
});
