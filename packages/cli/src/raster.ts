// Pixels for the CLI: @napi-rs/canvas ships prebuilt binaries for macOS, Linux and
// Windows, so nothing gets compiled on install.

import { createCanvas, GlobalFonts, type SKRSContext2D } from '@napi-rs/canvas';
import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drawFrame, Interp, TEXT_FONT, type Ctx2D } from 'squiggle-core';

let fontsReady = false;
function fonts(): void {
  if (fontsReady) return;
  fontsReady = true;
  const here = dirname(fileURLToPath(import.meta.url));
  for (const dir of [join(here, '..', 'fonts'), join(here, 'fonts'), join(here, '..', '..', 'fonts')]) {
    const f = join(dir, 'Fraunces_400Regular.ttf');
    if (existsSync(f)) {
      GlobalFonts.registerFromPath(f, TEXT_FONT);
      return;
    }
  }
}

export function stillPng(it: Interp, t: number, px: number): Buffer {
  fonts();
  const canvas = createCanvas(px, px);
  const ctx = canvas.getContext('2d');
  drawFrame(ctx as unknown as Ctx2D, it.frame(t).ops, px);
  return canvas.toBuffer('image/png');
}

export interface ClipOptions {
  seconds: number;
  fps: number;
  px: number;
  onFrame?: (done: number, total: number) => void;
}

function* frames(it: Interp, o: ClipOptions): Generator<Uint8ClampedArray> {
  fonts();
  const canvas = createCanvas(o.px, o.px);
  const ctx = canvas.getContext('2d') as SKRSContext2D;
  const total = Math.round(o.seconds * o.fps);
  for (let i = 0; i < total; i++) {
    // Offline and at a fixed rate: frame i is always t = i / fps, so clips are identical every time.
    drawFrame(ctx as unknown as Ctx2D, it.frame(i / o.fps).ops, o.px);
    yield ctx.getImageData(0, 0, o.px, o.px).data;
    o.onFrame?.(i + 1, total);
  }
}

export function gif(it: Interp, o: ClipOptions): Buffer {
  const enc = GIFEncoder();
  const delay = Math.round(1000 / o.fps);
  for (const rgba of frames(it, o)) {
    const palette = quantize(rgba, 256);
    const index = applyPalette(rgba, palette);
    enc.writeFrame(index, o.px, o.px, { palette, delay });
  }
  enc.finish();
  return Buffer.from(enc.bytes());
}

export async function mp4(it: Interp, o: ClipOptions): Promise<Buffer> {
  const mod = (await import('h264-mp4-encoder')) as { default?: unknown; createH264MP4Encoder?: unknown };
  const HME = (mod.default ?? mod) as { createH264MP4Encoder: () => Promise<H264Encoder> };
  const enc = await HME.createH264MP4Encoder();
  enc.width = o.px;
  enc.height = o.px;
  enc.frameRate = o.fps;
  enc.quantizationParameter = 16;
  enc.initialize();
  for (const rgba of frames(it, o)) enc.addFrameRgba(new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.byteLength));
  enc.finalize();
  const out = Buffer.from(enc.FS.readFile(enc.outputFilename));
  enc.delete();
  return out;
}

interface H264Encoder {
  width: number;
  height: number;
  frameRate: number;
  quantizationParameter: number;
  outputFilename: string;
  FS: { readFile(name: string): Uint8Array };
  initialize(): void;
  addFrameRgba(data: Uint8Array): void;
  finalize(): void;
  delete(): void;
}

export interface SheetItem {
  label: string;
  it: Interp;
}

/** A contact sheet: every piece as a thumbnail with its name under it. */
export function sheet(items: SheetItem[], t: number, cols: number, cell: number): Buffer {
  fonts();
  const pad = 16;
  const label = 28;
  const rows = Math.ceil(items.length / cols);
  const w = cols * (cell + pad) + pad;
  const h = rows * (cell + pad + label) + pad;
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f3eee4';
  ctx.fillRect(0, 0, w, h);
  const thumb = createCanvas(cell, cell);
  const tctx = thumb.getContext('2d');
  items.forEach((item, k) => {
    const x = pad + (k % cols) * (cell + pad);
    const y = pad + Math.floor(k / cols) * (cell + pad + label);
    try {
      drawFrame(tctx as unknown as Ctx2D, item.it.frame(t).ops, cell);
    } catch (e) {
      tctx.setTransform(1, 0, 0, 1, 0, 0);
      tctx.fillStyle = '#e6dcc8';
      tctx.fillRect(0, 0, cell, cell);
      tctx.fillStyle = '#a8432a';
      tctx.font = '14px sans-serif';
      tctx.fillText(String((e as Error).message).slice(0, 40), 8, cell / 2);
    }
    ctx.drawImage(thumb, x, y);
    ctx.fillStyle = '#15130f';
    ctx.font = `16px "${TEXT_FONT}", serif`;
    ctx.fillText(item.label, x, y + cell + 20);
  });
  return canvas.toBuffer('image/png');
}
