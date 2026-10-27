import { isIdentity, type Op } from './ops.ts';
import { SIZE } from './vocab.ts';

/** The slice of CanvasRenderingContext2D Squiggle uses. Browsers, OffscreenCanvas and @napi-rs/canvas all fit. */
export interface Ctx2D {
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  transform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  translate(x: number, y: number): void;
  scale(x: number, y: number): void;
  fillStyle: unknown;
  strokeStyle: unknown;
  lineWidth: number;
  lineCap: string;
  lineJoin: string;
  font: string;
  textAlign: string;
  textBaseline: string;
  beginPath(): void;
  closePath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, r: number, a0: number, a1: number): void;
  fill(): void;
  stroke(): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
}

export const TEXT_FONT = 'Fraunces';
const FONT_STACK = `"${TEXT_FONT}", Georgia, serif`;

/** Draws one frame. `px` is the canvas size in pixels (the sheet is always 512 units). */
export function drawFrame(ctx: Ctx2D, ops: Op[], px: number = SIZE): void {
  const s = px / SIZE;
  const half = px / 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const op of ops) {
    if (op.k === 'paper') {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = op.c;
      ctx.fillRect(0, 0, px, px);
      continue;
    }
    ctx.setTransform(s, 0, 0, -s, half, half);
    const m = op.m;
    if (!isIdentity(m)) ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
    switch (op.k) {
      case 'dot':
        ctx.fillStyle = op.c;
        ctx.beginPath();
        ctx.arc(op.x, op.y, op.r, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'ring':
        if (op.w <= 0) break;
        ctx.strokeStyle = op.c;
        ctx.lineWidth = op.w;
        ctx.beginPath();
        ctx.arc(op.x, op.y, op.r, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case 'box':
        ctx.fillStyle = op.c;
        ctx.fillRect(op.x - op.w / 2, op.y - op.h / 2, op.w, op.h);
        break;
      case 'line':
        if (op.w <= 0) break;
        ctx.strokeStyle = op.c;
        ctx.lineWidth = op.w;
        ctx.beginPath();
        ctx.moveTo(op.x1, op.y1);
        ctx.lineTo(op.x2, op.y2);
        ctx.stroke();
        break;
      case 'path':
      case 'shape': {
        const p = op.p;
        ctx.beginPath();
        ctx.moveTo(p[0], p[1]);
        for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
        if (op.k === 'shape') {
          ctx.closePath();
          ctx.fillStyle = op.c;
          ctx.fill();
        } else if (op.w > 0) {
          ctx.strokeStyle = op.c;
          ctx.lineWidth = op.w;
          ctx.stroke();
        }
        break;
      }
      case 'text':
        ctx.translate(op.x, op.y);
        ctx.scale(1, -1);
        ctx.fillStyle = op.c;
        ctx.font = `${op.size}px ${FONT_STACK}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(op.s, 0, 0);
        break;
    }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
