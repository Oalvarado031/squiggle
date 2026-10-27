import { PALETTE } from './vocab.ts';

/** A color: r, g, b from 0 to 255 and a from 0 to 1, always rounded so every renderer agrees. */
export interface Color {
  kind: 'color';
  r: number;
  g: number;
  b: number;
  a: number;
}

const clamp255 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function rgba(r: number, g: number, b: number, a = 1): Color {
  return { kind: 'color', r: clamp255(r), g: clamp255(g), b: clamp255(b), a: Math.round(clamp01(a) * 1000) / 1000 };
}

export function fromHex(hex: string): Color {
  let h = hex.replace(/^#/, '');
  if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
  const n = (k: number) => parseInt(h.slice(k, k + 2), 16);
  return rgba(n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1);
}

export const PALETTE_COLORS: Record<string, Color> = Object.fromEntries(
  Object.entries(PALETTE).map(([k, v]) => [k, fromHex(v)]),
);

/** hue in degrees, s and l from 0 to 1 (defaults chosen to sit well on paper and on ink) */
export function hue(h: number, s = 0.68, l = 0.58): Color {
  const hh = (((h % 360) + 360) % 360) / 360;
  s = clamp01(s);
  l = clamp01(l);
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (tt: number) => {
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  return rgba(f(hh + 1 / 3) * 255, f(hh) * 255, f(hh - 1 / 3) * 255);
}

// OKLab mixing keeps blends from going muddy in the middle.
const toLinear = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};
const fromLinear = (v: number) => {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(Math.max(0, v), 1 / 2.4) - 0.055;
  return c * 255;
};

function toOklab(c: Color): [number, number, number] {
  const r = toLinear(c.r), g = toLinear(c.g), b = toLinear(c.b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function fromOklab(L: number, A: number, B: number, a: number): Color {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return rgba(
    fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    a,
  );
}

export function mix(x: Color, y: Color, k: number): Color {
  k = clamp01(k);
  if (k === 0) return x;
  if (k === 1) return y;
  const a = toOklab(x);
  const b = toOklab(y);
  return fromOklab(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, x.a + (y.a - x.a) * k);
}

export function fade(c: Color, k: number): Color {
  return rgba(c.r, c.g, c.b, c.a * clamp01(k));
}

const hex2 = (v: number) => v.toString(16).padStart(2, '0');

export function toHex(c: Color): string {
  const base = `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`;
  return c.a >= 1 ? base : base + hex2(Math.round(c.a * 255));
}

export function toCss(c: Color): string {
  return c.a >= 1 ? `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}` : `rgba(${c.r},${c.g},${c.b},${c.a})`;
}

export function sameColor(a: Color, b: Color): boolean {
  return a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;
}

export function colorName(c: Color): string {
  for (const [k, v] of Object.entries(PALETTE_COLORS)) if (sameColor(c, v)) return k;
  return toHex(c);
}
