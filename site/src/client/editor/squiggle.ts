// CodeMirror 6 for Squiggle: highlighting, autocomplete, color swatches, hover docs,
// a signature hint for the command you're typing, and error underlines.

import { EditorState, StateField, type Extension } from '@codemirror/state';
import {
  Decoration, EditorView, ViewPlugin, WidgetType, drawSelection, highlightActiveLine, highlightActiveLineGutter, hoverTooltip,
  keymap, lineNumbers, showTooltip, type DecorationSet, type Tooltip, type ViewUpdate,
} from '@codemirror/view';
import { HighlightStyle, StreamLanguage, bracketMatching, indentUnit, syntaxHighlighting } from '@codemirror/language';
import { Tag } from '@lezer/highlight';
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap, snippetCompletion, type Completion, type CompletionContext } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { lintGutter, setDiagnostics, type Diagnostic } from '@codemirror/lint';
import { BLOCK_WORDS, BLOCKS, COMMANDS, CONSTANTS, FUNCTIONS, PALETTE, PALETTE_NOTES, classify, type ErrorInfo, type Warning } from 'squiggle-core';

// ---- language ----

const tags = {
  keyword: Tag.define(),
  command: Tag.define(),
  builtin: Tag.define(),
  palette: Tag.define(),
  number: Tag.define(),
  string: Tag.define(),
  color: Tag.define(),
  comment: Tag.define(),
  op: Tag.define(),
  name: Tag.define(),
};

interface LineState {
  curIndent: number;
  curOpens: boolean;
  curHas: boolean;
  lastIndent: number;
  lastOpens: boolean;
}

const BLOCK = new Set<string>(BLOCK_WORDS);

const squiggleLang = StreamLanguage.define<LineState>({
  name: 'squiggle',
  startState: () => ({ curIndent: 0, curOpens: false, curHas: false, lastIndent: 0, lastOpens: false }),
  token(stream, s) {
    if (stream.sol()) {
      if (s.curHas) {
        s.lastIndent = s.curIndent;
        s.lastOpens = s.curOpens;
      }
      s.curIndent = stream.indentation();
      s.curOpens = false;
      s.curHas = false;
    }
    if (stream.eatSpace()) return null;
    if (stream.match('//')) {
      stream.skipToEnd();
      return 'comment';
    }
    const first = !s.curHas;
    s.curHas = true;
    if (stream.match(/^"(?:[^"\\]|\\.)*"?/)) return 'string';
    if (stream.match(/^#[0-9a-fA-F]{3,8}\b/)) return 'color';
    if (stream.match(/^(?:\d+(?:\.\d+)?|\.\d+)/)) return 'number';
    if (stream.match(/^[A-Za-z_][A-Za-z0-9_]*/)) {
      const w = stream.current();
      if (first && BLOCK.has(w)) s.curOpens = true;
      return classify(w);
    }
    if (stream.match(/^(?:[+\-*/%^=<>!]=?|[()[\],.])/)) return 'op';
    stream.next();
    return null;
  },
  indent(s) {
    const indent = s.curHas ? s.curIndent : s.lastIndent;
    const opens = s.curHas ? s.curOpens : s.lastOpens;
    return opens ? indent + 2 : indent;
  },
  languageData: { commentTokens: { line: '//' } },
  tokenTable: tags,
});

const highlight = HighlightStyle.define([
  { tag: tags.keyword, class: 'sq-keyword' },
  { tag: tags.command, class: 'sq-command' },
  { tag: tags.builtin, class: 'sq-builtin' },
  { tag: tags.palette, class: 'sq-palette' },
  { tag: tags.number, class: 'sq-number' },
  { tag: tags.string, class: 'sq-string' },
  { tag: tags.color, class: 'sq-color' },
  { tag: tags.comment, class: 'sq-comment' },
  { tag: tags.op, class: 'sq-op' },
]);

const theme = EditorView.theme({
  '&': { color: 'var(--ink)', backgroundColor: 'var(--sheet)', fontSize: '14.5px', height: '100%' },
  '.cm-scroller': { fontFamily: 'var(--mono)', lineHeight: '1.65' },
  '.cm-content': { caretColor: 'var(--ember)', padding: '14px 0' },
  '.cm-gutters': { backgroundColor: 'transparent', color: 'var(--ink-3)', border: 'none', paddingLeft: '6px' },
  '.cm-lineNumbers .cm-gutterElement': { minWidth: '2ch', padding: '0 8px 0 4px' },
  '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--ember) 7%, transparent)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--ink)' },
  '&.cm-focused': { outline: 'none' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': { backgroundColor: 'color-mix(in srgb, var(--ember) 24%, transparent) !important' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--ember)', borderLeftWidth: '2px' },
  '.cm-matchingBracket': { backgroundColor: 'color-mix(in srgb, var(--ink) 10%, transparent)', outline: 'none' },
  '.cm-tooltip': { backgroundColor: 'var(--sheet)', color: 'var(--ink)', border: '1px solid var(--rule-strong)', borderRadius: '8px', boxShadow: 'var(--shadow)', fontFamily: 'var(--serif)', fontSize: '14px' },
  '.cm-tooltip-autocomplete > ul': { fontFamily: 'var(--mono)', fontSize: '13px', maxHeight: '15em' },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: 'var(--ink)', color: 'var(--paper)' },
  '.cm-completionDetail': { fontStyle: 'normal', opacity: 0.7, marginLeft: '1em' },
  '.cm-completionInfo': { padding: '8px 10px', maxWidth: '280px' },
  '.cm-tooltip-lint': { fontFamily: 'var(--serif)' },
  '.cm-diagnostic-error': { borderLeft: '3px solid var(--ember)' },
  '.cm-diagnostic-warning': { borderLeft: '3px solid #c79a2a' },
  '.cm-lintRange-error': { backgroundImage: 'none', textDecoration: 'underline wavy var(--ember)', textUnderlineOffset: '4px', textDecorationSkipInk: 'none' },
  '.cm-lintRange-warning': { backgroundImage: 'none', textDecoration: 'underline dotted #c79a2a', textUnderlineOffset: '4px' },
  '.cm-lint-marker': { width: '0.8em', height: '0.8em' },
  '.sq-swatch': { display: 'inline-block', width: '0.78em', height: '0.78em', borderRadius: '50%', margin: '0 0.3em 0 0.1em', verticalAlign: '-0.06em', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.18)' },
  '.sq-hint': { padding: '5px 9px', fontFamily: 'var(--mono)', fontSize: '12.5px', color: 'var(--ink-2)' },
  '.sq-hint b': { color: 'var(--ember-deep)', fontWeight: '600' },
  '.sq-doc': { padding: '8px 10px', maxWidth: '300px', lineHeight: '1.45' },
  '.sq-doc code': { fontFamily: 'var(--mono)', fontSize: '12.5px', display: 'block', marginBottom: '4px', color: 'var(--ink)' },
});

// ---- autocomplete ----

const commandSnippet = (usage: string): string => {
  // "dot x, y, size [, color]" → "dot ${x}, ${y}, ${size}"
  const [name, ...rest] = usage.replace(/\s*\[.*$/, '').split(' ');
  const args = rest.join(' ').split(',').map((a) => a.trim()).filter(Boolean);
  return args.length ? `${name} ${args.map((a) => '${' + a + '}').join(', ')}` : `${name} \${}`;
};

const info = (usage: string, summary: string) => () => {
  const el = document.createElement('div');
  el.className = 'sq-doc';
  const code = document.createElement('code');
  code.textContent = usage;
  el.append(code, summary);
  return el;
};

const swatchCompletion = (name: string, hex: string): Completion => ({
  label: name,
  type: 'constant',
  detail: hex,
  info: () => {
    const el = document.createElement('div');
    el.className = 'sq-doc';
    el.innerHTML = `<span class="sq-swatch" style="background:${hex};width:1.4em;height:1.4em"></span> ${PALETTE_NOTES[name] ?? ''}`;
    return el;
  },
  boost: -1,
});

const STATIC_START: Completion[] = [
  ...COMMANDS.map((c) => snippetCompletion(commandSnippet(c.usage), { label: c.name, type: 'function', detail: c.usage.slice(c.name.length + 1), info: info(c.usage, c.summary), boost: 3 })),
  snippetCompletion('every frame\n\t${}', { label: 'every frame', type: 'keyword', info: info('every frame', BLOCKS[0].summary), boost: 4 }),
  snippetCompletion('repeat ${12} as ${i}\n\t${}', { label: 'repeat', type: 'keyword', detail: 'n as i', info: info('repeat n as i', BLOCKS[1].summary), boost: 4 }),
  snippetCompletion('for ${item} in ${list}\n\t${}', { label: 'for', type: 'keyword', detail: 'item in list', info: info('for item in list', BLOCKS[2].summary) }),
  snippetCompletion('if ${test}\n\t${}', { label: 'if', type: 'keyword', info: info('if test', BLOCKS[3].summary) }),
  snippetCompletion('else\n\t${}', { label: 'else', type: 'keyword' }),
  snippetCompletion('keep\n\t${}', { label: 'keep', type: 'keyword', info: info('keep', BLOCKS[4].summary) }),
  snippetCompletion('make ${name} ${a}\n\t${}', { label: 'make', type: 'keyword', detail: 'name a, b', info: info('make name a, b', BLOCKS[5].summary) }),
  snippetCompletion('when key "${space}"\n\t${}', { label: 'when key', type: 'keyword', info: info('when key "space"', BLOCKS[6].summary) }),
  snippetCompletion('when click\n\t${}', { label: 'when click', type: 'keyword', info: info('when click', BLOCKS[7].summary) }),
];

const STATIC_VALUE: Completion[] = [
  ...FUNCTIONS.map((f) =>
    f.name === 'rand'
      ? { label: 'rand', type: 'function', detail: '0 to 1', info: info(f.usage, f.summary) }
      : snippetCompletion(`${f.name}(\${})`, { label: f.name, type: 'function', detail: f.usage.slice(f.name.length), info: info(f.usage, f.summary) }),
  ),
  ...CONSTANTS.map((c) => ({ label: c.name, type: 'constant', info: info(c.usage, c.summary) })),
  ...Object.entries(PALETTE).map(([n, hex]) => swatchCompletion(n, hex)),
  { label: 'true', type: 'keyword' },
  { label: 'false', type: 'keyword' },
  { label: 'and', type: 'keyword' },
  { label: 'or', type: 'keyword' },
  { label: 'not', type: 'keyword' },
];

function localNames(doc: string, except: string): Completion[] {
  const out = new Map<string, Completion>();
  for (const m of doc.matchAll(/^\s*([A-Za-z_]\w*)\s*[-+*/]?=(?!=)/gm)) out.set(m[1], { label: m[1], type: 'variable' });
  for (const m of doc.matchAll(/\bas\s+([A-Za-z_]\w*)|\bfor\s+([A-Za-z_]\w*)\s+in\b/g)) {
    const n = m[1] ?? m[2];
    out.set(n, { label: n, type: 'variable' });
  }
  for (const m of doc.matchAll(/^make\s+([A-Za-z_]\w*)([^\n]*)/gm)) {
    out.set(m[1], { label: m[1], type: 'function', detail: m[2].trim(), boost: 2 });
    for (const p of m[2].split(',').map((x) => x.trim()).filter(Boolean)) out.set(p, { label: p, type: 'variable' });
  }
  out.delete(except);
  return [...out.values()];
}

function complete(ctx: CompletionContext) {
  const word = ctx.matchBefore(/[A-Za-z_]\w*/);
  if (!word && !ctx.explicit) return null;
  const from = word?.from ?? ctx.pos;
  const line = ctx.state.doc.lineAt(ctx.pos);
  const before = line.text.slice(0, from - line.from);
  if (before.includes('//') || (before.match(/"/g)?.length ?? 0) % 2 === 1) return null;
  const atStart = /^\s*$/.test(before);
  const typed = word ? ctx.state.sliceDoc(word.from, word.to) : '';
  const locals = localNames(ctx.state.doc.toString(), typed);
  const options = atStart ? [...STATIC_START, ...locals.filter((l) => l.type === 'function' || l.type === 'variable'), ...STATIC_VALUE.filter((o) => o.type !== 'constant' || o.label === 't')] : [...locals, ...STATIC_VALUE];
  return { from, options, validFor: /^[A-Za-z_]\w*$/ };
}

// ---- color swatches next to palette names and hex colors ----

class Swatch extends WidgetType {
  constructor(readonly color: string) {
    super();
  }
  eq(other: Swatch) {
    return other.color === this.color;
  }
  toDOM() {
    const s = document.createElement('span');
    s.className = 'sq-swatch';
    s.style.background = this.color;
    s.setAttribute('aria-hidden', 'true');
    return s;
  }
}

function swatches(view: EditorView): DecorationSet {
  const ranges = [];
  const re = /#[0-9a-fA-F]{3,8}\b|\b[a-z]+\b/g;
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.sliceDoc(from, to);
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(text))) {
      const tok = m[0];
      const color = tok.startsWith('#') ? ([3, 4, 6, 8].includes(tok.length - 1) ? tok : null) : PALETTE[tok];
      if (!color) continue;
      const pos = from + m.index;
      const line = view.state.doc.lineAt(pos);
      const before = line.text.slice(0, pos - line.from);
      if (before.includes('//') || (before.match(/"/g)?.length ?? 0) % 2 === 1) continue;
      if (tok === 'paper' && /^\s*$/.test(before)) continue; // the paper command, not the color
      ranges.push(Decoration.widget({ widget: new Swatch(color), side: -1 }).range(pos));
    }
  }
  return Decoration.set(ranges, true);
}

const swatchPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = swatches(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged) this.decorations = swatches(u.view);
    }
  },
  { decorations: (v) => v.decorations },
);

// ---- hover docs ----

const DOCS = new Map<string, { usage: string; summary: string }>();
for (const e of [...COMMANDS, ...FUNCTIONS, ...CONSTANTS]) DOCS.set(e.name, e);
for (const b of BLOCKS) DOCS.set(b.name.split(' ')[0], { usage: b.usage.split('\n')[0], summary: b.summary });

const hover = hoverTooltip((view, pos) => {
  const { from, to, text } = view.state.doc.lineAt(pos);
  let start = pos;
  let end = pos;
  while (start > from && /\w/.test(text[start - from - 1])) start--;
  while (end < to && /\w/.test(text[end - from])) end++;
  const word = text.slice(start - from, end - from);
  const doc = DOCS.get(word);
  const hex = PALETTE[word];
  if (!doc && !hex) return null;
  return {
    pos: start,
    end,
    above: true,
    create: () => {
      const dom = doc ? info(doc.usage, doc.summary)() : info(word, `${PALETTE_NOTES[word]} (${hex})`)();
      return { dom };
    },
  };
});

// ---- signature hint: "dot x, y, size [, color]" with the current value in bold ----

const SIGS = new Map<string, string>();
for (const c of COMMANDS) SIGS.set(c.name, c.usage);
for (const f of FUNCTIONS) SIGS.set(f.name, f.usage);

function signature(state: EditorState): Tooltip | null {
  const sel = state.selection.main;
  if (!sel.empty) return null;
  const line = state.doc.lineAt(sel.head);
  const before = line.text.slice(0, sel.head - line.from);
  if (before.includes('//')) return null;
  // Innermost open call: name( … ; otherwise the command at the start of the line.
  let depth = 0;
  let commas = 0;
  let name = '';
  for (let k = before.length - 1; k >= 0; k--) {
    const ch = before[k];
    if (ch === ')' || ch === ']') depth++;
    else if (ch === '(' || ch === '[') {
      if (depth === 0) {
        const m = /([A-Za-z_]\w*)$/.exec(before.slice(0, k));
        if (ch === '(' && m && SIGS.has(m[1]) && !COMMANDS.some((c) => c.name === m[1] && before.trimStart().startsWith(m[1] + '('))) {
          name = m[1];
          break;
        }
        commas = 0;
        depth = -1;
        break;
      }
      depth--;
    } else if (ch === ',' && depth === 0) commas++;
  }
  if (!name) {
    const m = /^\s*([a-z]+)[ (]/.exec(before);
    if (!m || !COMMANDS.some((c) => c.name === m[1])) return null;
    name = m[1];
    commas = 0;
    let d = 0;
    for (const ch of before.slice(m[0].length)) {
      if (ch === '(' || ch === '[') d++;
      else if (ch === ')' || ch === ']') d--;
      else if (ch === ',' && d === 0) commas++;
    }
  }
  const usage = SIGS.get(name)!;
  return {
    pos: sel.head,
    above: true,
    strictSide: true,
    arrow: false,
    create: () => {
      const dom = document.createElement('div');
      dom.className = 'sq-hint';
      const head = usage.match(/^[a-z]+\(?\s?/)![0];
      const args = usage.slice(head.length).replace(/\)$/, '').split(/,\s*/);
      const tail = usage.endsWith(')') ? ')' : '';
      dom.innerHTML = head.replace(/</g, '&lt;') + args.map((a, k) => (k === commas ? `<b>${a.replace(/</g, '&lt;')}</b>` : a.replace(/</g, '&lt;'))).join(', ') + tail;
      return { dom };
    },
  };
}

const signatureField = StateField.define<Tooltip | null>({
  create: signature,
  update: (value, tr) => (tr.docChanged || tr.selection ? signature(tr.state) : value),
  provide: (f) => showTooltip.from(f),
});

// ---- the editor ----

export interface EditorOptions {
  parent: HTMLElement;
  doc: string;
  onChange?: (code: string) => void;
  hints?: boolean;
  label?: string;
}

export function squiggleExtensions(opts: { onChange?: (code: string) => void; hints?: boolean; label?: string }): Extension[] {
  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightActiveLine(),
    history(),
    drawSelection(),
    indentUnit.of('  '),
    EditorState.tabSize.of(2),
    squiggleLang,
    syntaxHighlighting(highlight),
    bracketMatching(),
    closeBrackets(),
    autocompletion({ override: [complete], icons: false, activateOnTyping: true }),
    keymap.of([...closeBracketsKeymap, ...completionKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab]),
    lintGutter(),
    swatchPlugin,
    hover,
    ...(opts.hints === false ? [] : [signatureField]),
    theme,
    EditorView.lineWrapping,
    EditorView.contentAttributes.of({ 'aria-label': opts.label ?? 'Squiggle code', spellcheck: 'false', autocapitalize: 'off', autocorrect: 'off' }),
    EditorView.updateListener.of((u) => {
      if (u.docChanged) opts.onChange?.(u.state.doc.toString());
    }),
  ];
}

export function createEditor(opts: EditorOptions): EditorView {
  return new EditorView({ parent: opts.parent, state: EditorState.create({ doc: opts.doc, extensions: squiggleExtensions(opts) }) });
}

export function setCode(view: EditorView, code: string): void {
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: code } });
}

/** Shows the current error (and notes) as underlines in the editor. */
export function showProblems(view: EditorView, error: ErrorInfo | null, warnings: Warning[] = []): void {
  const doc = view.state.doc;
  const diags: Diagnostic[] = [];
  const range = (line: number, col: number, len: number) => {
    const l = doc.line(Math.max(1, Math.min(doc.lines, line)));
    const from = Math.min(l.to, l.from + Math.max(0, col - 1));
    const to = Math.max(from, Math.min(l.to, from + len));
    return from === to && from > l.from ? { from: from - 1, to } : { from, to: Math.max(to, Math.min(l.to, from + 1)) };
  };
  if (error) diags.push({ ...range(error.line, error.col, error.len), severity: 'error', message: error.message + (error.hint ? `\ntry: ${error.hint}` : '') });
  for (const w of warnings) diags.push({ ...range(w.line, w.col, 3), severity: 'warning', message: w.message });
  view.dispatch(setDiagnostics(view.state, diags));
}
