import { isIdentity, type Mat, type Op } from './ops.ts';
import { SIZE } from './vocab.ts';
import { TEXT_FONT } from './render-canvas.ts';

const n = (v: number) => {
  const r = Math.round(v * 1000) / 1000;
  return String(r === 0 ? 0 : r);
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** "#rrggbb" or "rgba(r,g,b,a)" to an SVG paint plus opacity */
function paint(c: string): [string, number] {
  if (c.startsWith('rgba(')) {
    const [r, g, b, a] = c.slice(5, -1).split(',').map(Number);
    const hex = '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
    return [hex, a];
  }
  return [c, 1];
}

const fill = (c: string) => {
  const [p, a] = paint(c);
  return a < 1 ? `fill="${p}" fill-opacity="${n(a)}"` : `fill="${p}"`;
};

const stroke = (c: string, w: number) => {
  const [p, a] = paint(c);
  return `fill="none" stroke="${p}" stroke-width="${n(w)}" stroke-linecap="round" stroke-linejoin="round"${a < 1 ? ` stroke-opacity="${n(a)}"` : ''}`;
};

const tf = (m: Mat) => (isIdentity(m) ? '' : ` transform="matrix(${m.map(n).join(' ')})"`);

const pts = (p: number[]) => {
  const out: string[] = [];
  for (let i = 0; i < p.length; i += 2) out.push(`${n(p[i])},${n(p[i + 1])}`);
  return out.join(' ');
};

/** The frame's shapes as SVG elements in sheet units (wrap them in svgFrame or place them yourself). */
export function svgShapes(ops: Op[]): string {
  const out: string[] = [];
  for (const op of ops) {
    switch (op.k) {
      case 'paper':
        out.push(`<rect x="-256" y="-256" width="512" height="512" ${fill(op.c)}/>`);
        break;
      case 'dot':
        out.push(`<circle cx="${n(op.x)}" cy="${n(op.y)}" r="${n(op.r)}" ${fill(op.c)}${tf(op.m)}/>`);
        break;
      case 'ring':
        if (op.w > 0) out.push(`<circle cx="${n(op.x)}" cy="${n(op.y)}" r="${n(op.r)}" ${stroke(op.c, op.w)}${tf(op.m)}/>`);
        break;
      case 'box': {
        const w = Math.abs(op.w);
        const h = Math.abs(op.h);
        if (w && h) out.push(`<rect x="${n(op.x - w / 2)}" y="${n(op.y - h / 2)}" width="${n(w)}" height="${n(h)}" ${fill(op.c)}${tf(op.m)}/>`);
        break;
      }
      case 'line':
        if (op.w > 0) out.push(`<line x1="${n(op.x1)}" y1="${n(op.y1)}" x2="${n(op.x2)}" y2="${n(op.y2)}" ${stroke(op.c, op.w)}${tf(op.m)}/>`);
        break;
      case 'path':
        if (op.w > 0) out.push(`<polyline points="${pts(op.p)}" ${stroke(op.c, op.w)}${tf(op.m)}/>`);
        break;
      case 'shape':
        out.push(`<polygon points="${pts(op.p)}" ${fill(op.c)}${tf(op.m)}/>`);
        break;
      case 'text': {
        const m = op.m;
        const pre = isIdentity(m) ? '' : `matrix(${m.map(n).join(' ')}) `;
        out.push(
          `<text transform="${pre}translate(${n(op.x)} ${n(op.y)}) scale(1 -1)" y="${n(op.size * 0.34)}" font-family="${TEXT_FONT}" font-size="${n(op.size)}" text-anchor="middle" ${fill(op.c)}>${esc(op.s)}</text>`,
        );
        break;
      }
    }
  }
  return out.join('');
}

/** A group that places a 512-unit sheet at (x, y) with the given pixel size, y up. */
export function svgPlaced(ops: Op[], x: number, y: number, px: number, clipId?: string): string {
  const s = px / SIZE;
  const clip = clipId ? `<clipPath id="${clipId}"><rect x="${n(x)}" y="${n(y)}" width="${n(px)}" height="${n(px)}"/></clipPath>` : '';
  const open = clipId ? `<g clip-path="url(#${clipId})">` : '<g>';
  return `${clip}${open}<g transform="matrix(${n(s)} 0 0 ${n(-s)} ${n(x + px / 2)} ${n(y + px / 2)})">${svgShapes(ops)}</g></g>`;
}

/** A complete standalone SVG for one frame. */
export function svgFrame(ops: Op[], px: number = SIZE): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${px} ${px}">${svgPlaced(ops, 0, 0, px, 'sheet')}</svg>`;
}
