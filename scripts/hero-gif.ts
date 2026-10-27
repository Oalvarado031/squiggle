// docs/hero.gif for the README: six starters moving side by side.
//   npm run hero-gif
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { EXAMPLES, Interp, drawFrame, type Ctx2D } from 'squiggle-core';

const ROOT = process.cwd();
GlobalFonts.registerFromPath(join(ROOT, 'packages/cli/fonts/Fraunces_400Regular.ttf'), 'Fraunces');
const PICKS = ['tide', 'clockwork', 'bloom', 'jellyfish', 'tides-of-dots', 'heartbeat'];
const CELL = 232;
const GAP = 14;
const COLS = 3;
const FPS = 15;
const SECONDS = 4;
const W = COLS * CELL + (COLS + 1) * GAP;
const H = 2 * CELL + 3 * GAP;

const pieces = PICKS.map((s) => new Interp(EXAMPLES.find((e) => e.slug === s)!.code));
const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d');
const cell = createCanvas(CELL, CELL);
const cctx = cell.getContext('2d');

mkdirSync(join(ROOT, 'docs'), { recursive: true });
const out = join(ROOT, 'docs/hero.gif');
const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(FPS), '-i', '-',
  '-filter_complex', '[0:v]split[a][b];[a]palettegen=max_colors=192:stats_mode=full[p];[b][p]paletteuse=dither=sierra2_4a', '-loop', '0', out], { stdio: ['pipe', 'inherit', 'inherit'] });
for (let f = 0; f < FPS * SECONDS; f++) {
  ctx.fillStyle = '#f3eee4';
  ctx.fillRect(0, 0, W, H);
  pieces.forEach((it, k) => {
    drawFrame(cctx as unknown as Ctx2D, it.frame(f / FPS).ops, CELL);
    ctx.drawImage(cell, GAP + (k % COLS) * (CELL + GAP), GAP + Math.floor(k / COLS) * (CELL + GAP));
  });
  const data = ctx.getImageData(0, 0, W, H).data;
  await new Promise<void>((res) => ff.stdin.write(Buffer.from(data.buffer, data.byteOffset, data.byteLength), () => res()));
}
ff.stdin.end();
await new Promise((res) => ff.on('close', res));
console.log(out);
