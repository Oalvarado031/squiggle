// A frame is a flat list of drawing operations in sheet coordinates (origin at the
// center, y up). Every number is snapped to a fixed grid so tiny float differences
// between JavaScript engines can't change the pixels or the frame hash.

/** 2D affine transform [a, b, c, d, e, f], mapping (x, y) to (a·x + c·y + e, b·x + d·y + f) */
export type Mat = [number, number, number, number, number, number];

export const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];

export type Op =
  | { k: 'paper'; c: string }
  | { k: 'dot'; m: Mat; x: number; y: number; r: number; c: string }
  | { k: 'ring'; m: Mat; x: number; y: number; r: number; c: string; w: number }
  | { k: 'box'; m: Mat; x: number; y: number; w: number; h: number; c: string }
  | { k: 'line'; m: Mat; x1: number; y1: number; x2: number; y2: number; c: string; w: number }
  | { k: 'path'; m: Mat; p: number[]; c: string; w: number }
  | { k: 'shape'; m: Mat; p: number[]; c: string }
  | { k: 'text'; m: Mat; s: string; x: number; y: number; size: number; c: string };

/** positions and sizes: 1/256 px */
export const q = (v: number): number => {
  const r = Math.round(v * 256) / 256;
  return r === 0 ? 0 : r; // no -0
};

/** rotation/scale part of a matrix: 1/65536 */
export const qm = (v: number): number => {
  const r = Math.round(v * 65536) / 65536;
  return r === 0 ? 0 : r;
};

export function snapMat(m: Mat): Mat {
  return [qm(m[0]), qm(m[1]), qm(m[2]), qm(m[3]), q(m[4]), q(m[5])];
}

export function isIdentity(m: Mat): boolean {
  return m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1 && m[4] === 0 && m[5] === 0;
}

export function mul(m: Mat, n: Mat): Mat {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

/** A stable text form of one op; frame hashes are built from these. */
export function opKey(op: Op): string {
  switch (op.k) {
    case 'paper': return `P${op.c}`;
    case 'dot': return `D${op.m.join(',')}|${op.x},${op.y},${op.r}|${op.c}`;
    case 'ring': return `R${op.m.join(',')}|${op.x},${op.y},${op.r},${op.w}|${op.c}`;
    case 'box': return `B${op.m.join(',')}|${op.x},${op.y},${op.w},${op.h}|${op.c}`;
    case 'line': return `L${op.m.join(',')}|${op.x1},${op.y1},${op.x2},${op.y2},${op.w}|${op.c}`;
    case 'path': return `H${op.m.join(',')}|${op.p.join(',')},${op.w}|${op.c}`;
    case 'shape': return `S${op.m.join(',')}|${op.p.join(',')}|${op.c}`;
    case 'text': return `T${op.m.join(',')}|${JSON.stringify(op.s)},${op.x},${op.y},${op.size}|${op.c}`;
  }
}

/** 64-bit hash (two independent 32-bit lanes) of a frame, as 16 hex characters */
export function hashOps(ops: Op[]): string {
  let h1 = 0xdeadbeef ^ ops.length;
  let h2 = 0x41c6ce57 ^ ops.length;
  for (const op of ops) {
    const s = opKey(op) + '\n';
    for (let i = 0; i < s.length; i++) {
      const ch = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}
