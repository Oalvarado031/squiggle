#!/usr/bin/env node
// Draws the extension's icons from the Squiggle mark in packages/core/src/brand.ts:
//
//   icon.png             128×128 marketplace icon: the stroke in ink on a paper rounded square
//   icons/sqg-light.svg  .sqg file icon for light themes
//   icons/sqg-dark.svg   .sqg file icon for dark themes
//
// Run it with `npm run gen -w squiggle-vscode` (needs @napi-rs/canvas, installed at the repo root).

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, Path2D } from '@napi-rs/canvas';
import { BRAND, LOGO_PATH, LOGO_STROKE, LOGO_VIEWBOX } from '../../core/src/brand.ts';

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const [vx, vy, vw, vh] = LOGO_VIEWBOX.split(/\s+/).map(Number);
const cx = vx + vw / 2;
const cy = vy + vh / 2;

// --- icon.png ---------------------------------------------------------------------------------

const SIZE = 128;
const canvas = createCanvas(SIZE, SIZE);
const ctx = canvas.getContext('2d');

const radius = 26;
ctx.beginPath();
ctx.moveTo(radius, 0);
ctx.arcTo(SIZE, 0, SIZE, SIZE, radius);
ctx.arcTo(SIZE, SIZE, 0, SIZE, radius);
ctx.arcTo(0, SIZE, 0, 0, radius);
ctx.arcTo(0, 0, SIZE, 0, radius);
ctx.closePath();
ctx.fillStyle = BRAND.paper;
ctx.fill();

// The mark's viewBox spans 104 of the 128 pixels, centered.
const scale = 104 / vw;
ctx.save();
ctx.translate(SIZE / 2 - cx * scale, SIZE / 2 - cy * scale);
ctx.scale(scale, scale);
ctx.strokeStyle = BRAND.ink;
ctx.lineWidth = LOGO_STROKE * 1.15;
ctx.lineCap = 'round';
ctx.lineJoin = 'round';
ctx.stroke(new Path2D(LOGO_PATH));
ctx.restore();

writeFileSync(join(pkgDir, 'icon.png'), canvas.toBuffer('image/png'));
console.log('wrote icon.png');

// --- file icons -------------------------------------------------------------------------------
// A square box around the mark, with a heavier stroke so it reads at 16 pixels. Ember on both
// themes: a touch deeper on light backgrounds, a touch brighter on dark ones.

const box = vw;
const viewBox = [cx - box / 2, cy - box / 2, box, box].map((n) => +n.toFixed(2)).join(' ');
const svg = (stroke) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="${viewBox}">` +
  `<path d="${LOGO_PATH}" fill="none" stroke="${stroke}" stroke-width="${+(LOGO_STROKE * 1.8).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"/>` +
  `</svg>\n`;

mkdirSync(join(pkgDir, 'icons'), { recursive: true });
writeFileSync(join(pkgDir, 'icons', 'sqg-light.svg'), svg('#d24a22'));
writeFileSync(join(pkgDir, 'icons', 'sqg-dark.svg'), svg('#ef6b43'));
console.log('wrote icons/sqg-light.svg, icons/sqg-dark.svg');
console.log(`(brand ember is ${BRAND.ember})`);
