// The 20-second launch clip, drawn frame by frame with the real interpreter:
// the logo draws itself, code is typed line by line while the sheet comes alive,
// the stamp lands, then the share card. Writes vertical (1080×1920) and horizontal
// (1920×1080) MP4s with ffmpeg.
//
//   npm run record -- [piece-slug]

import { createCanvas, GlobalFonts, Path2D, loadImage, type SKRSContext2D } from '@napi-rs/canvas';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EXAMPLES, Interp, LOGO_PATH, POST_LIMIT, SITE_URL, drawFrame, highlight, postLength, type Ctx2D, type Op } from 'squiggle-core';
import { configureRenderer, ogCard } from '../site/src/worker/render.ts';

const ROOT = process.cwd(); // run from the repo root
const FPS = 30;
const SECONDS = 20;
const slug = process.argv[2] ?? 'tide';
const piece = EXAMPLES.find((e) => e.slug === slug) ?? EXAMPLES[0];
const code = piece.code.trimEnd();

const font = (p: string) => join(ROOT, 'site/src/worker/fonts', p);
GlobalFonts.registerFromPath(font('Fraunces_400Regular.ttf'), 'Fraunces');
GlobalFonts.registerFromPath(font('Fraunces_600SemiBold.ttf'), 'Fraunces SemiBold');
GlobalFonts.registerFromPath(font('JetBrainsMono_400Regular.ttf'), 'JetBrains Mono');

const C = { paper: '#f3eee4', sheet: '#fbf8f2', ink: '#15130f', ink2: '#4a453c', ink3: '#8a8478', rule: 'rgba(21,19,15,0.14)', ember: '#e4572e', tape: 'rgba(222,205,160,0.75)' };
const SYN: Record<string, string> = { keyword: '#8a3a1c', command: '#b8401d', builtin: '#2b6266', palette: '#5b4a7a', number: '#6e4a6b', string: '#4f6a33', color: '#5b4a7a', comment: '#8a8478', op: '#6f695e', name: C.ink, space: C.ink };

// ---- timeline (seconds) ----
const T = { logo: [0, 1.6], type: [1.4, 9.6], alive: [9.6, 13.4], card: [13.4, 18.4], end: [18.4, 20] };
const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const ease = (x: number) => {
  const k = clamp(x);
  return k * k * (3 - 2 * k);
};
const phase = (t: number, [a, b]: number[]) => clamp((t - a) / (b - a));

// Typing: a little faster on spaces, a short pause at each line end.
const typedAt: number[] = [];
{
  const weights = [...code].map((ch) => (ch === '\n' ? 5 : ch === ' ' ? 0.6 : 1));
  const total = weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  for (const w of weights) {
    acc += w;
    typedAt.push(T.type[0] + (acc / total) * (T.type[1] - T.type[0] - 0.4));
  }
}
const typedCount = (t: number) => typedAt.filter((x) => x <= t).length;

// The sheet shows the code typed so far, as soon as it runs. Lines are added whole.
const runs = new Map<number, Interp | null>();
function interpFor(nChars: number): Interp | null {
  const text = code.slice(0, nChars);
  const cut = text.lastIndexOf('\n');
  const upTo = nChars >= code.length ? code.length : cut;
  if (upTo <= 0) return null;
  if (!runs.has(upTo)) {
    try {
      const it = new Interp(code.slice(0, upTo));
      it.frame(0);
      runs.set(upTo, it);
    } catch {
      runs.set(upTo, null);
    }
  }
  return runs.get(upTo) ?? null;
}
let lastGood: Interp | null = null;

const sheetCanvas = createCanvas(1024, 1024);
const sheetCtx = sheetCanvas.getContext('2d');
function drawSheetArt(ops: Op[]) {
  drawFrame(sheetCtx as unknown as Ctx2D, ops, 1024);
}

function drawLogo(ctx: SKRSContext2D, x: number, y: number, scale: number, progress: number, color = C.ink) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.strokeStyle = color;
  ctx.lineWidth = 4.2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const path = new Path2D(LOGO_PATH);
  const len = 150;
  ctx.setLineDash([len, len]);
  ctx.lineDashOffset = len * (1 - progress);
  ctx.stroke(path);
  ctx.restore();
}

function roundRect(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function grain(ctx: SKRSContext2D, w: number, h: number) {
  // a fixed speckle so the paper never looks flat
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  ctx.fillStyle = 'rgba(80,60,30,0.035)';
  for (let k = 0; k < (w * h) / 900; k++) ctx.fillRect(rnd() * w, rnd() * h, 1.6, 1.6);
}

interface Layout {
  w: number;
  h: number;
  code: { x: number; y: number; w: number; h: number; size: number };
  sheet: { x: number; y: number; s: number };
  meter: { x: number; y: number };
  title: { x: number; y: number; size: number };
}

const HORIZONTAL: Layout = {
  w: 1920, h: 1080,
  code: { x: 110, y: 250, w: 880, h: 640, size: 30 },
  sheet: { x: 1060, y: 150, s: 760 },
  meter: { x: 110, y: 950 },
  title: { x: 110, y: 160, size: 64 },
};
const VERTICAL: Layout = {
  w: 1080, h: 1920,
  code: { x: 80, y: 300, w: 920, h: 500, size: 26 },
  sheet: { x: 130, y: 990, s: 820 },
  meter: { x: 80, y: 836 },
  title: { x: 80, y: 210, size: 72 },
};

function drawCode(ctx: SKRSContext2D, L: Layout, n: number, t: number) {
  const { x, y, w, h, size } = L.code;
  ctx.fillStyle = C.sheet;
  roundRect(ctx, x, y, w, h, 16);
  ctx.fill();
  ctx.strokeStyle = C.rule;
  ctx.lineWidth = 2;
  ctx.stroke();
  const lh = size * 1.6;
  ctx.font = `${size}px "JetBrains Mono"`;
  ctx.textBaseline = 'alphabetic';
  let cx = x + 40;
  let cy = y + 30 + lh;
  let line = 1;
  ctx.fillStyle = C.ink3;
  ctx.fillText(String(line), x + 14 - 0, cy);
  cx = x + 70;
  const charW = ctx.measureText('m').width;
  const maxCols = Math.floor((w - 100) / charW);
  let col = 0;
  const shown = code.slice(0, n);
  for (const tok of highlight(shown)) {
    // wrap before a token that would cross the edge, never inside it
    if (tok.text !== '\n' && tok.cls !== 'space' && col > 0 && col + tok.text.length > maxCols && tok.text.length < maxCols) {
      cy += lh;
      cx = x + 70 + charW * 2;
      col = 2;
    }
    for (const ch of tok.text) {
      if (ch === '\n') {
        line++;
        cy += lh;
        cx = x + 70;
        col = 0;
        ctx.fillStyle = C.ink3;
        ctx.fillText(String(line), x + 14, cy);
        continue;
      }
      if (col >= maxCols) {
        cy += lh;
        cx = x + 70 + charW * 2;
        col = 2;
      }
      ctx.fillStyle = SYN[tok.cls] ?? C.ink;
      ctx.fillText(ch, cx, cy);
      cx += charW;
      col++;
    }
  }
  // caret
  if (n < code.length || Math.floor(t * 2) % 2 === 0) {
    ctx.fillStyle = C.ember;
    ctx.fillRect(cx + 1, cy - size * 0.82, 3, size);
  }
}

/** letter-spaced text centered on x; returns its width */
function spaced(ctx: SKRSContext2D, text: string, x: number, y: number, gap: number): number {
  const widths = [...text].map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + gap * (text.length - 1);
  let cx = x - total / 2;
  [...text].forEach((ch, k) => {
    ctx.fillText(ch, cx, y);
    cx += widths[k] + gap;
  });
  return total;
}

function drawMeter(ctx: SKRSContext2D, L: Layout, n: number, stampIn: number, alpha: number) {
  const { x, y } = L.meter;
  const count = postLength(code.slice(0, n));
  ctx.lineWidth = 7;
  ctx.strokeStyle = C.rule;
  ctx.beginPath();
  ctx.arc(x + 32, y + 32, 26, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = count > POST_LIMIT * 0.9 ? C.ember : C.ink;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(x + 32, y + 32, 26, -Math.PI / 2, -Math.PI / 2 + (Math.min(count, POST_LIMIT) / POST_LIMIT) * Math.PI * 2);
  ctx.stroke();
  ctx.font = '32px "JetBrains Mono"';
  ctx.fillStyle = C.ink;
  ctx.fillText(`${count}`, x + 84, y + 44);
  const nw = ctx.measureText(`${count}`).width;
  ctx.fillStyle = C.ink3;
  ctx.fillText(` / ${POST_LIMIT}`, x + 84 + nw, y + 44);
  if (stampIn > 0) {
    const k = ease(stampIn);
    ctx.save();
    ctx.translate(x + 430, y + 32);
    ctx.rotate(-0.1);
    const s = 1 + (1 - k) * 1.2;
    ctx.scale(s, s);
    ctx.globalAlpha = alpha * k;
    ctx.fillStyle = C.ember;
    ctx.font = '21px "JetBrains Mono"';
    const w = spaced(ctx, 'FITS IN A POST', 0, 8, 5);
    ctx.strokeStyle = C.ember;
    ctx.lineWidth = 3.5;
    roundRect(ctx, -w / 2 - 22, -27, w + 44, 54, 8);
    ctx.stroke();
    ctx.restore();
  }
}

function drawSheet(ctx: SKRSContext2D, L: Layout, it: Interp | null, pieceT: number, lift: number) {
  const { x, y, s } = L.sheet;
  ctx.save();
  ctx.translate(x + s / 2, y + s / 2);
  ctx.rotate(-0.012 + lift * 0.012);
  const sc = 1 + lift * 0.03;
  ctx.scale(sc, sc);
  ctx.translate(-s / 2, -s / 2);
  ctx.shadowColor = 'rgba(70,45,10,0.28)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 18;
  ctx.fillStyle = C.sheet;
  ctx.fillRect(-18, -18, s + 36, s + 36);
  ctx.shadowColor = 'transparent';
  if (it) {
    drawSheetArt(it.frame(pieceT).ops);
    ctx.drawImage(sheetCanvas, 0, 0, s, s);
  } else {
    ctx.fillStyle = C.paper;
    ctx.fillRect(0, 0, s, s);
  }
  ctx.fillStyle = C.tape;
  ctx.save();
  ctx.translate(s / 2, -14);
  ctx.rotate(-0.05);
  ctx.fillRect(-70, -16, 140, 34);
  ctx.restore();
  ctx.restore();
}

function wordmark(ctx: SKRSContext2D, x: number, y: number, size: number, draw: number, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  // the mark's middle (y = 28 in its 64-unit box) sits on the text's middle
  const k = size / 26;
  drawLogo(ctx, x - 5 * k, y - 0.34 * size - 28 * k, k, draw);
  ctx.fillStyle = C.ink;
  ctx.font = `${size}px "Fraunces SemiBold"`;
  ctx.globalAlpha = alpha * clamp((draw - 0.3) / 0.7);
  ctx.fillText('squiggle', x + 60 * k, y);
  ctx.restore();
}

async function frames(L: Layout, card: Uint8Array, write: (buf: Buffer) => Promise<void>) {
  const canvas = createCanvas(L.w, L.h);
  const ctx = canvas.getContext('2d');
  const cardImg = await loadImage(Buffer.from(card));
  lastGood = null;
  for (let f = 0; f < FPS * SECONDS; f++) {
    const t = f / FPS;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = C.paper;
    ctx.fillRect(0, 0, L.w, L.h);
    grain(ctx, L.w, L.h);

    const studioIn = ease(phase(t, [1.0, 1.8]));
    const cardIn = ease(phase(t, [T.card[0], T.card[0] + 0.8]));
    const endIn = ease(phase(t, [T.end[0], T.end[0] + 0.6]));

    if (t < 1.8) {
      // the mark draws itself in the middle, then slides into the corner
      const draw = ease(phase(t, [0.1, 1.2]));
      const k = studioIn;
      const big = L.w < L.h ? 64 : 72;
      const small = 34;
      const size = big + (small - big) * k;
      const cx = (L.w - size * 7.2) / 2 + ((L.w < L.h ? 80 : 110) - (L.w - size * 7.2) / 2) * k;
      const cy = L.h / 2 + size / 3 + ((L.w < L.h ? 110 : 80) - L.h / 2 - size / 3) * k;
      wordmark(ctx, cx, cy, size, draw);
    } else {
      wordmark(ctx, L.w < L.h ? 80 : 110, L.w < L.h ? 110 : 80, 34, 1, 1 - cardIn);
    }

    if (t >= 1.0 && t < T.card[1]) {
      const alpha = studioIn * (1 - cardIn);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = C.ink;
      ctx.font = `${L.title.size}px "Fraunces SemiBold"`;
      ctx.fillText(piece.title, L.title.x, L.title.y + 20);
      const n = typedCount(t);
      drawCode(ctx, L, n, t);
      const it = interpFor(n);
      if (it) lastGood = it;
      const stamp = phase(t, [T.alive[0] + 0.3, T.alive[0] + 0.75]);
      drawMeter(ctx, L, n, stamp, alpha);
      drawSheet(ctx, L, lastGood, Math.max(0, t - T.type[0]), ease(phase(t, T.alive)) * (1 - cardIn));
      ctx.globalAlpha = 1;
    }

    if (t >= T.card[0]) {
      // the share card, as it shows up in a post
      const alpha = cardIn * (1 - endIn);
      ctx.globalAlpha = alpha;
      const cw = L.w < L.h ? 940 : 1320;
      const chh = (cw * 630) / 1200;
      const cx = (L.w - cw) / 2;
      const cy = L.w < L.h ? 660 : 300;
      const rise = (1 - cardIn) * 60;
      ctx.fillStyle = C.ink;
      ctx.font = `${L.w < L.h ? 88 : 84}px "Fraunces SemiBold"`;
      ctx.textAlign = 'center';
      ctx.fillText('Code you can post.', L.w / 2, (L.w < L.h ? 460 : 190) + rise);
      ctx.font = `${L.w < L.h ? 34 : 32}px "Fraunces"`;
      ctx.fillStyle = C.ink2;
      ctx.fillText('the code is the post · the link shows the art', L.w / 2, (L.w < L.h ? 540 : 250) + rise);
      ctx.textAlign = 'left';
      ctx.save();
      ctx.shadowColor = 'rgba(70,45,10,0.25)';
      ctx.shadowBlur = 50;
      ctx.shadowOffsetY = 20;
      roundRect(ctx, cx, cy + rise, cw, chh, 22);
      ctx.fillStyle = C.sheet;
      ctx.fill();
      ctx.restore();
      ctx.save();
      roundRect(ctx, cx, cy + rise, cw, chh, 22);
      ctx.clip();
      ctx.drawImage(cardImg, cx, cy + rise, cw, chh);
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    if (t >= T.end[0]) {
      ctx.globalAlpha = endIn;
      const size = L.w < L.h ? 70 : 76;
      const draw = ease(phase(t, [T.end[0], T.end[0] + 1]));
      ctx.font = `${size}px "Fraunces SemiBold"`;
      const markW = (60 * size) / 26 + ctx.measureText('squiggle').width;
      wordmark(ctx, (L.w - markW) / 2, L.h / 2 - 70, size, draw, endIn);
      ctx.globalAlpha = endIn;
      ctx.textAlign = 'center';
      ctx.fillStyle = C.ink;
      ctx.font = `${L.w < L.h ? 52 : 50}px "Fraunces"`;
      ctx.fillText('Code you can post.', L.w / 2, L.h / 2 + 30);
      ctx.fillStyle = C.ink2;
      ctx.font = `${L.w < L.h ? 32 : 30}px "JetBrains Mono"`;
      ctx.fillText(SITE_URL.replace(/^https:\/\//, ''), L.w / 2, L.h / 2 + 100);
      ctx.textAlign = 'left';
      ctx.globalAlpha = 1;
    }

    const data = ctx.getImageData(0, 0, L.w, L.h).data;
    await write(Buffer.from(data.buffer, data.byteOffset, data.byteLength));
  }
}

async function encode(L: Layout, card: Uint8Array, out: string) {
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${L.w}x${L.h}`, '-r', String(FPS), '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const write = (buf: Buffer) => new Promise<void>((res, rej) => (ff.stdin.write(buf, (e) => (e ? rej(e) : res()))));
  await frames(L, card, write);
  ff.stdin.end();
  await new Promise<void>((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error(`ffmpeg exited ${c}`)))));
  console.log(out);
}

await configureRenderer(readFileSync(join(ROOT, 'node_modules/@resvg/resvg-wasm/index_bg.wasm')), [
  readFileSync(font('Fraunces_400Regular.ttf')),
  readFileSync(font('Fraunces_600SemiBold.ttf')),
  readFileSync(font('JetBrainsMono_400Regular.ttf')),
]);
const card = ogCard(new Interp(code).frame(1).ops, { title: piece.title, handle: 'squiggle', code });
const outDir = join(ROOT, 'launch');
mkdirSync(outDir, { recursive: true });
if (process.env.SNAP) {
  // SNAP=2,6,11,15,19 writes stills at those seconds instead of videos (for checking the look)
  const { writeFileSync } = await import('node:fs');
  const want = new Set(process.env.SNAP.split(',').map((x) => Math.round(Number(x) * FPS)));
  for (const L of [HORIZONTAL, VERTICAL]) {
    let f = 0;
    await frames(L, card, async (buf) => {
      if (want.has(f)) {
        const c = createCanvas(L.w, L.h);
        const x = c.getContext('2d');
        const img = x.createImageData(L.w, L.h);
        img.data.set(buf);
        x.putImageData(img, 0, 0);
        writeFileSync(join(ROOT, 'out', `snap-${L.w}x${L.h}-${(f / FPS).toFixed(1)}.png`), c.toBuffer('image/png'));
      }
      f++;
    });
  }
} else {
  await encode(HORIZONTAL, card, join(outDir, 'squiggle-20s-horizontal.mp4'));
  await encode(VERTICAL, card, join(outDir, 'squiggle-20s-vertical.mp4'));
}
