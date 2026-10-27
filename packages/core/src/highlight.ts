// A forgiving highlighter for showing code (it never throws, even on half-typed lines).
// The studio's CodeMirror mode and the static code blocks both use classify().

import { COMMAND_NAMES, CONSTANT_NAMES, FUNCTION_NAMES, KEYWORD_NAMES, PALETTE } from './vocab.ts';

export type TokenClass = 'comment' | 'string' | 'number' | 'color' | 'keyword' | 'command' | 'builtin' | 'palette' | 'name' | 'op' | 'space';

export function classify(word: string): TokenClass {
  if (KEYWORD_NAMES.has(word)) return 'keyword';
  if (COMMAND_NAMES.has(word)) return 'command';
  if (FUNCTION_NAMES.has(word) || CONSTANT_NAMES.has(word)) return 'builtin';
  if (word in PALETTE) return 'palette';
  return 'name';
}

const RULES: Array<[RegExp, TokenClass | null]> = [
  [/^\/\/.*/, 'comment'],
  [/^"(?:[^"\\]|\\.)*"?/, 'string'],
  [/^#[0-9a-fA-F]{3,8}\b/, 'color'],
  [/^(?:\d+(?:\.\d+)?|\.\d+)/, 'number'],
  [/^[A-Za-z_][A-Za-z0-9_]*/, null],
  [/^[ \t ]+/, 'space'],
  [/^(?:[+\-*/%^=<>!]=?|[()[\],.])/, 'op'],
];

export function highlight(code: string): Array<{ text: string; cls: TokenClass }> {
  const out: Array<{ text: string; cls: TokenClass }> = [];
  for (const [li, line] of code.split('\n').entries()) {
    if (li > 0) out.push({ text: '\n', cls: 'space' });
    let rest = line;
    while (rest.length) {
      let matched = false;
      for (const [re, cls] of RULES) {
        const m = re.exec(rest);
        if (m) {
          out.push({ text: m[0], cls: cls ?? classify(m[0]) });
          rest = rest.slice(m[0].length);
          matched = true;
          break;
        }
      }
      if (!matched) {
        out.push({ text: rest[0], cls: 'op' });
        rest = rest.slice(1);
      }
    }
  }
  return out;
}

const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Code as HTML spans with sq-* classes. */
export function highlightHtml(code: string): string {
  return highlight(code)
    .map(({ text, cls }) => (cls === 'space' || cls === 'name' ? escHtml(text) : `<span class="sq-${cls}">${escHtml(text)}</span>`))
    .join('');
}
