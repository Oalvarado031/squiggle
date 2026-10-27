// Seeded randomness and noise. Both are plain integer and float math, so the same seed
// gives the same numbers in every browser, in Node and in the Worker.

/** sfc32, a small fast generator with a 128-bit state */
export class Rand {
  private a = 0;
  private b = 0;
  private c = 0;
  private d = 0;

  constructor(seed = 1) {
    this.reseed(seed);
  }

  reseed(seed: number): void {
    // Spread the seed (any number, including fractions) over the four state words.
    let h = hashString(String(seed));
    const next = () => {
      h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
      h = Math.imul(h ^ (h >>> 13), 0x45d9f3b);
      h ^= h >>> 16;
      return h >>> 0;
    };
    this.a = next();
    this.b = next();
    this.c = next();
    this.d = 1;
    for (let i = 0; i < 12; i++) this.next();
  }

  /** a float in [0, 1) */
  next(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return (t >>> 0) / 4294967296;
  }
}

/** 32-bit string hash (FNV-1a with a final mix) */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return h >>> 0;
}

// Improved Perlin noise with a fixed permutation, so noise(x, y, z) never changes.
const PERM = new Uint8Array(512);
{
  const r = new Rand(20261027);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r.next() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
}

const fadeCurve = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function grad(hash: number, x: number, y: number, z: number): number {
  const h = hash & 15;
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

/** smooth noise in about [-1, 1] */
export function noise3(x: number, y: number, z: number): number {
  const fx = Math.floor(x), fy = Math.floor(y), fz = Math.floor(z);
  const X = fx & 255, Y = fy & 255, Z = fz & 255;
  x -= fx;
  y -= fy;
  z -= fz;
  const u = fadeCurve(x), v = fadeCurve(y), w = fadeCurve(z);
  const A = PERM[X] + Y, AA = PERM[A] + Z, AB = PERM[A + 1] + Z;
  const B = PERM[X + 1] + Y, BA = PERM[B] + Z, BB = PERM[B + 1] + Z;
  const n = lerp(
    lerp(lerp(grad(PERM[AA], x, y, z), grad(PERM[BA], x - 1, y, z), u), lerp(grad(PERM[AB], x, y - 1, z), grad(PERM[BB], x - 1, y - 1, z), u), v),
    lerp(lerp(grad(PERM[AA + 1], x, y, z - 1), grad(PERM[BA + 1], x - 1, y, z - 1), u), lerp(grad(PERM[AB + 1], x, y - 1, z - 1), grad(PERM[BB + 1], x - 1, y - 1, z - 1), u), v),
    w,
  );
  // Raw Perlin rarely leaves [-0.7, 0.7]; stretch it so the whole range gets used.
  return Math.max(-1, Math.min(1, n * 1.4));
}
