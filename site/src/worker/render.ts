// Server-side pictures: the interpreter's display list becomes SVG, resvg-wasm turns it
// into PNG. Used for the wall still (t = 1), the 3-second preview sprite and OG cards.

import { initWasm, Resvg } from '@resvg/resvg-wasm';
import { Interp, LOGO_PATH, POST_LIMIT, postLength, svgFrame, svgPlaced, toErrorInfo, type ErrorInfo, type Op } from 'squiggle-core';

let ready: Promise<void> | null = null;
let fonts: Uint8Array[] = [];

/** The Worker passes its bundled wasm module and font files; tests pass bytes from disk. */
export function configureRenderer(wasm: WebAssembly.Module | BufferSource, fontFiles: Array<ArrayBuffer | Uint8Array>): Promise<void> {
  fonts = fontFiles.map((f) => (f instanceof Uint8Array ? f : new Uint8Array(f)));
  ready ??= initWasm(wasm);
  return ready;
}

function png(svg: string): Uint8Array {
  const r = new Resvg(svg, {
    fitTo: { mode: 'original' },
    font: { fontBuffers: fonts, defaultFontFamily: 'Fraunces', serifFamily: 'Fraunces', monospaceFamily: 'JetBrains Mono' },
    shapeRendering: 2,
    textRendering: 1,
  });
  try {
    return r.render().asPng();
  } finally {
    r.free();
  }
}

/** Server renders get the same per-frame budget as the studio, plus a ceiling for the whole preview. */
export const PIN_BUDGET = {
  frameSteps: 250_000,
  previewSteps: 6_000_000,
  /** shapes across all preview frames; heavier pieces get fewer preview frames */
  previewOps: 150_000,
  seconds: 3,
  maxFrames: 45,
  minFrames: 12,
  cell: 320,
};

export class PinError extends Error {
  error: ErrorInfo;
  constructor(error: ErrorInfo) {
    super(error.message);
    this.error = error;
  }
}

export interface Rendered {
  still: Uint8Array;
  sprite: Uint8Array;
  frames: number;
  fps: number;
  cols: number;
  cell: number;
  animated: boolean;
  interactive: boolean;
  stillOps: Op[];
}

/** Runs the piece headless. Throws PinError (with line and column) when it can't be pinned. */
export function renderPiece(code: string): Rendered {
  let it: Interp;
  let stillOps: Op[];
  try {
    it = new Interp(code, { frameSteps: PIN_BUDGET.frameSteps });
    stillOps = it.frame(1).ops;
  } catch (e) {
    throw new PinError(toErrorInfo(e));
  }
  const still = png(svgFrame(stillOps, 512));
  if (!it.animated) {
    return { still, sprite: still, frames: 1, fps: 1, cols: 1, cell: 512, animated: false, interactive: it.interactive, stillOps };
  }

  // How many frames can this piece afford? Light pieces get 15 fps, heavy ones fewer.
  let probe: Op[];
  try {
    probe = it.frame(0).ops;
  } catch (e) {
    throw new PinError(toErrorInfo(e));
  }
  const perFrame = Math.max(probe.length, stillOps.length, 1);
  const frames = Math.max(PIN_BUDGET.minFrames, Math.min(PIN_BUDGET.maxFrames, Math.floor(PIN_BUDGET.previewOps / perFrame)));
  const fps = frames / PIN_BUDGET.seconds;
  const cols = Math.min(frames, 9);
  const rows = Math.ceil(frames / cols);
  const cell = PIN_BUDGET.cell;
  let steps = 0;
  const parts: string[] = [];
  for (let i = 0; i < frames; i++) {
    let f;
    try {
      f = it.frame(i / fps);
    } catch (e) {
      throw new PinError(toErrorInfo(e));
    }
    steps += f.steps;
    if (steps > PIN_BUDGET.previewSteps) {
      throw new PinError({
        kind: 'budget',
        message: `this piece needs more than ${PIN_BUDGET.previewSteps.toLocaleString('en-US')} steps for a 3-second preview, which is more than the wall can render`,
        line: 1, col: 1, len: 1,
        hint: 'draw fewer shapes per frame, or use smaller repeat counts',
      });
    }
    parts.push(svgPlaced(f.ops, (i % cols) * cell, Math.floor(i / cols) * cell, cell, `f${i}`));
  }
  const w = cols * cell;
  const h = rows * cell;
  const sprite = png(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="#f3eee4"/>${parts.join('')}</svg>`);
  return { still, sprite, frames, fps, cols, cell, animated: true, interactive: it.interactive, stillOps };
}

// ---- OG cards, 1200 × 630 ----

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Greedy wrap by an estimated glyph width (Fraunces averages about half an em). */
function wrap(text: string, size: number, width: number, maxLines: number): string[] {
  const perLine = Math.max(4, Math.floor(width / (size * 0.52)));
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > perLine && cur) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = kept[maxLines - 1].replace(/.{0,2}$/, '') + '…';
    return kept;
  }
  return lines.map((l) => (l.length > perLine ? l.slice(0, perLine - 1) + '…' : l));
}

export interface CardText {
  title: string;
  handle?: string | null;
  code: string;
  /** small line above the title */
  kicker?: string;
}

export function ogCard(ops: Op[], text: CardText): Uint8Array {
  const n = postLength(text.code);
  const fits = n <= POST_LIMIT;
  let size = 64;
  let lines = wrap(text.title, size, 470, 3);
  if (lines.length === 3) {
    size = 52;
    lines = wrap(text.title, size, 470, 3);
  }
  const titleY = 250 - ((lines.length - 1) * size * 1.08) / 2;
  const title = lines.map((l, k) => `<tspan x="668" y="${(titleY + k * size * 1.08).toFixed(1)}">${esc(l)}</tspan>`).join('');
  const by = text.handle ? `@${text.handle}` : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<defs><filter id="sh" x="-10%" y="-10%" width="120%" height="125%"><feGaussianBlur stdDeviation="12"/></filter></defs>
<rect width="1200" height="630" fill="#f3eee4"/>
<g transform="rotate(-1.4 330 320)">
<rect x="58" y="58" width="552" height="552" fill="#5a3c14" opacity="0.22" filter="url(#sh)"/>
<rect x="44" y="40" width="568" height="568" rx="3" fill="#fbf8f2"/>
${svgPlaced(ops, 56, 52, 544, 'art')}
<rect x="282" y="26" width="96" height="26" fill="#decda0" opacity="0.75" transform="rotate(-3 330 39)"/>
</g>
<g transform="translate(664 64) scale(1.05)"><path d="${LOGO_PATH}" fill="none" stroke="#15130f" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round" transform="translate(-4 -14)"/></g>
<text x="740" y="98" font-family="Fraunces" font-weight="600" font-size="36" fill="#15130f">squiggle</text>
${text.kicker ? `<text x="668" y="${(titleY - size - 6).toFixed(1)}" font-family="JetBrains Mono" font-size="17" letter-spacing="2" fill="#6f695e">${esc(text.kicker.toUpperCase())}</text>` : ''}
<text font-family="Fraunces" font-weight="600" font-size="${size}" fill="#15130f">${title}</text>
${by ? `<text x="668" y="${(titleY + lines.length * size * 1.08 + 10).toFixed(1)}" font-family="JetBrains Mono" font-size="24" fill="#4a453c">${esc(by)}</text>` : ''}
<line x1="668" y1="500" x2="1140" y2="500" stroke="#15130f" stroke-opacity="0.18" stroke-width="1.5"/>
<text x="668" y="560" font-family="Fraunces" font-weight="600" font-size="58" fill="#15130f">${n}<tspan font-family="JetBrains Mono" font-weight="400" font-size="22" fill="#4a453c" dx="10">/ ${POST_LIMIT} chars</tspan></text>
${fits ? `<g transform="rotate(-6 1050 540)"><rect x="962" y="518" width="176" height="44" rx="6" fill="none" stroke="#e4572e" stroke-width="3"/><text x="1050" y="547" text-anchor="middle" font-family="JetBrains Mono" font-weight="400" font-size="15" letter-spacing="2.4" fill="#e4572e">FITS IN A POST</text></g>` : ''}
</svg>`;
  return png(svg);
}

/** The frame used for OG cards: t = 1, or the still for pieces without every frame. */
export function cardOps(code: string): Op[] {
  return new Interp(code, { frameSteps: PIN_BUDGET.frameSteps }).frame(1).ops;
}
