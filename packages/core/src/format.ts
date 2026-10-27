// tidy: one canonical layout. squeeze: the shortest safe version of the same piece.
// Both work on tokens (so comments and layout choices survive tidy) after a full parse
// (so they never touch code that doesn't run).

import { parse } from './parser.ts';
import type { Token } from './lexer.ts';
import { Interp } from './interpreter.ts';
import { hashOps } from './ops.ts';
import { PALETTE_COLORS, fromHex, sameColor } from './color.ts';
import { RESERVED, KEYWORD_NAMES } from './vocab.ts';
import { postLength } from './share.ts';

const WORD = /[A-Za-z0-9_]/;
const isWordTok = (t: Token) => t.type === 'name' || t.type === 'num' || t.type === 'str' || t.type === 'color';
const closes = (t: Token) => t.type === 'op' && (t.text === ')' || t.text === ']');
const BINARY = new Set(['+', '-', '*', '/', '%', '^', '=', '+=', '-=', '*=', '/=', '==', '!=', '<', '>', '<=', '>=']);

interface Line {
  depth: number;
  toks: Token[];
  first: number; // source line of the first token
  last: number; // source line of the last token
}

function logicalLines(tokens: Token[]): Line[] {
  const out: Line[] = [];
  let depth = 0;
  let cur: Token[] = [];
  for (const t of tokens) {
    if (t.type === 'indent') depth++;
    else if (t.type === 'dedent') depth--;
    else if (t.type === 'newline' || t.type === 'eof') {
      if (cur.length) out.push({ depth, toks: cur, first: cur[0].line, last: cur[cur.length - 1].line });
      cur = [];
    } else cur.push(t);
  }
  return out;
}

/** Does the parser care whether there's a space before this token? */
function spaceMatters(prev: Token, t: Token): boolean {
  if (!(isWordTok(prev) || closes(prev))) return false;
  if (t.type === 'op' && (t.text === '(' || t.text === '[')) return true;
  if (t.type === 'op' && t.text === '-' && t.unary) return true;
  return false;
}

function tidyJoin(toks: Token[]): string {
  let s = '';
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    const prev = toks[k - 1];
    if (k > 0) {
      let space = true;
      if (t.type === 'op' && (t.text === ',' || t.text === ')' || t.text === ']')) space = false;
      else if (prev.type === 'op' && (prev.text === '(' || prev.text === '[')) space = false;
      else if (t.type === 'op' && t.text === '.') space = false;
      else if (prev.type === 'op' && prev.text === '.') space = false;
      else if (prev.type === 'op' && prev.text === '-' && prev.unary) space = false;
      else if (spaceMatters(prev, t)) space = t.space;
      s += space ? ' ' : '';
    }
    s += t.text;
  }
  return s;
}

export interface TidyResult {
  code: string;
}

/** Re-lays out a piece: two spaces per level, one space around operators, comments kept. */
export function tidy(source: string): string {
  const prog = parse(source);
  const lines = logicalLines(prog.tokens);
  const srcLines = source.replace(/\r\n?/g, '\n').split('\n');
  const blank = (n: number) => (srcLines[n - 1] ?? '').trim() === '';
  const own = prog.comments.filter((c) => c.own);
  const trailing = new Map<number, string>();
  for (const c of prog.comments) if (!c.own) trailing.set(c.line, c.text);

  const out: string[] = [];
  let lastSrc = 0;
  let oi = 0;
  const gap = (from: number, to: number) => {
    // one blank line wherever the source had at least one
    for (let n = from + 1; n < to; n++) if (blank(n)) return true;
    return false;
  };
  const pushLine = (text: string, src: number) => {
    if (out.length && gap(lastSrc, src)) out.push('');
    out.push(text);
    lastSrc = src;
  };
  for (const line of lines) {
    while (oi < own.length && own[oi].line < line.first) {
      pushLine('  '.repeat(line.depth) + '//' + own[oi].text.replace(/\s+$/, ''), own[oi].line);
      oi++;
    }
    let text = '  '.repeat(line.depth) + tidyJoin(line.toks);
    for (let n = line.first; n <= line.last; n++) {
      const c = trailing.get(n);
      if (c !== undefined) text += ' //' + c.replace(/\s+$/, '');
    }
    pushLine(text, line.last);
  }
  while (oi < own.length) {
    pushLine('//' + own[oi].text.replace(/\s+$/, ''), own[oi].line);
    oi++;
  }
  return out.join('\n') + '\n';
}

// ---- squeeze ----

function shortNumber(t: Token): string {
  const v = t.value as number;
  let s = String(v);
  if (/e/i.test(s)) return t.text;
  if (s.startsWith('0.')) s = s.slice(1);
  return s.length < t.text.length ? s : t.text;
}

function shortColor(hex: string): string {
  const c = fromHex(hex);
  for (const [name, pc] of Object.entries(PALETTE_COLORS)) {
    if (sameColor(c, pc) && name.length < hex.length + 1) return name;
  }
  let h = hex;
  if (h.length === 8 && h.endsWith('ff')) h = h.slice(0, 6);
  if ((h.length === 6 || h.length === 8) && [...h].every((ch, k) => k % 2 === 1 || ch === h[k + 1])) {
    h = [...h].filter((_, k) => k % 2 === 0).join('');
  }
  return '#' + h;
}

function* shortNames(): Generator<string> {
  const letters = 'abcdefghjklmnopqrsuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'; // no i or t
  for (const a of letters) yield a;
  for (const a of letters) for (const b of letters + '0123456789_') yield a + b;
}

function squeezeJoin(toks: Token[], rename: Map<string, string> | null): string {
  let s = '';
  let prev: Token | null = null;
  for (const t of toks) {
    let text = t.text;
    if (t.type === 'num') text = shortNumber(t);
    else if (t.type === 'color') text = shortColor(t.value as string);
    else if (t.type === 'name' && rename?.has(t.text) && !(prev && prev.type === 'op' && prev.text === '.')) text = rename.get(t.text)!;
    if (prev) {
      const a = s[s.length - 1];
      const b = text[0];
      let space = WORD.test(a) && WORD.test(b);
      if (b === '.' && /[0-9]/.test(text[1] ?? '') && WORD.test(a)) space = true;
      if (spaceMatters(prev, t) && t.space) space = true;
      // never glue two operators into a different one (a / /b would start a comment)
      if (prev.type === 'op' && t.type === 'op' && BINARY.has(t.text) && (BINARY.has(a + b) || (a === '/' && b === '/'))) space = true;
      if (space) s += ' ';
    }
    s += text;
    prev = t;
  }
  return s;
}

function dropAsI(toks: Token[]): Token[] {
  // "repeat n as i" means the same as "repeat n"
  const k = toks.length;
  if (k >= 4 && toks[0].text === 'repeat' && toks[k - 2].text === 'as' && toks[k - 1].text === 'i' && toks[k - 2].type === 'name') {
    return toks.slice(0, k - 2);
  }
  return toks;
}

function render(lines: Line[], rename: Map<string, string> | null, asI: boolean): string {
  return lines.map((l) => ' '.repeat(l.depth) + squeezeJoin(asI ? dropAsI(l.toks) : l.toks, rename)).join('\n');
}

function fingerprint(code: string): string {
  const it = new Interp(code);
  const times = it.animated ? [0, 0.37, 1, 2.5, 6.1] : [0];
  return times
    .map((t) => {
      const f = it.frame(t);
      return hashOps(f.ops) + f.logs.join('\u0001');
    })
    .join('|');
}

export interface SqueezeResult {
  code: string;
  before: number;
  after: number;
  /** what was applied, for the CLI report */
  steps: string[];
}

/** Shortens a piece without changing what it draws; every candidate is checked frame by frame. */
export function squeeze(source: string): SqueezeResult {
  const prog = parse(source);
  const before = postLength(source);
  const lines = logicalLines(prog.tokens);
  const reference = fingerprint(source);

  // Rename longer names to free short ones, most-used first.
  const counts = new Map<string, number>();
  for (let k = 0; k < prog.tokens.length; k++) {
    const t = prog.tokens[k];
    const prev = prog.tokens[k - 1];
    if (t.type !== 'name' || RESERVED.has(t.text) || KEYWORD_NAMES.has(t.text)) continue;
    if (prev && prev.type === 'op' && prev.text === '.') continue;
    counts.set(t.text, (counts.get(t.text) ?? 0) + 1);
  }
  const taken = new Set<string>([...counts.keys()].filter((n) => n.length === 1));
  taken.add('i');
  const rename = new Map<string, string>();
  const gen = shortNames();
  for (const [name] of [...counts].filter(([n]) => n.length > 1).sort((a, b) => b[1] * b[0].length - a[1] * a[0].length)) {
    let next = gen.next();
    while (!next.done && (taken.has(next.value) || RESERVED.has(next.value) || counts.has(next.value))) next = gen.next();
    if (next.done || next.value.length >= name.length) continue;
    rename.set(name, next.value);
    taken.add(next.value);
  }

  const attempts: Array<[Map<string, string> | null, boolean, string[]]> = [
    [rename.size ? rename : null, true, ['spacing', 'numbers', 'colors', rename.size ? 'names' : '', 'repeat as i'].filter(Boolean)],
    [null, true, ['spacing', 'numbers', 'colors', 'repeat as i']],
    [null, false, ['spacing', 'numbers', 'colors']],
  ];
  for (const [ren, asI, steps] of attempts) {
    const code = render(lines, ren, asI);
    try {
      if (fingerprint(code) === reference) return { code, before, after: postLength(code), steps };
    } catch {
      // try the next, more careful version
    }
  }
  const code = tidy(source).trimEnd();
  return { code, before, after: postLength(code), steps: ['tidy only'] };
}
