export { SquiggleError, formatError, toErrorInfo, closest, type ErrorInfo } from './errors.ts';
export { lex, type Token, type Comment } from './lexer.ts';
export { parse, type Program, type Stmt, type Expr, type Pos } from './parser.ts';
export { Interp, Shell, show, typeName, type Frame, type Value, type Warning, type Limits } from './interpreter.ts';
export { hashOps, IDENTITY, type Op, type Mat } from './ops.ts';
export { drawFrame, TEXT_FONT, type Ctx2D } from './render-canvas.ts';
export { svgFrame, svgPlaced, svgShapes } from './render-svg.ts';
export { encodeCode, decodeCode, postLength, postText, LINK_LENGTH } from './share.ts';
export { PALETTE_COLORS, fromHex, toCss, toHex, hue, mix, type Color } from './color.ts';
export * from './vocab.ts';

import { Interp, type Frame, type Limits } from './interpreter.ts';

/** One-shot helper: the frame of `code` at time t. */
export function render(code: string, t = 0, limits?: Partial<Limits>): Frame {
  return new Interp(code, limits).frame(t);
}
export { tidy, squeeze, type SqueezeResult } from './format.ts';
export { highlight, highlightHtml, classify, type TokenClass } from './highlight.ts';
export { SITE_URL, studioLink } from './site.ts';
export { EXAMPLES, SEEDS, type Example } from './examples.gen.ts';
export { LOGO_PATH, LOGO_VIEWBOX, LOGO_STROKE, BRAND } from './brand.ts';
