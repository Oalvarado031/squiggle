#!/usr/bin/env node
// Checks the extension end to end without VS Code:
//
//  1. the grammar is valid JSON and every regex in it compiles with Oniguruma (VS Code's engine);
//  2. it tokenizes Squiggle the way we expect (LANGUAGE.md, every vocab example, examples/*.sqg),
//     with no unscoped or invalid tokens in valid code;
//  3. every snippet, filled in with its defaults, is a Squiggle program that runs;
//  4. extension.js, run against a stand-in `vscode` module, opens studio links whose payload
//     decodes back to the code (with zlib and with the studio's own decodeCode), refuses links that
//     are too long, and shows the same post length as core's postLength.
//
// Run it with `npm run check -w squiggle-vscode`. Pass --print to see the scopes of a few lines.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import Module from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';
import vsctm from 'vscode-textmate';
import onig from 'vscode-oniguruma';
import * as core from '../../core/src/index.ts';

const require = createRequire(import.meta.url);
const pkgDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = join(pkgDir, '..', '..');
const print = process.argv.includes('--print');

let failures = 0;
const fail = (msg) => {
  failures++;
  console.error(`  ✗ ${msg}`);
};
const ok = (msg) => console.log(`  ✓ ${msg}`);

// ---------------------------------------------------------------------------------------------
console.log('grammar');

await onig.loadWASM(readFileSync(require.resolve('vscode-oniguruma/release/onig.wasm')).buffer);
const grammarPath = join(pkgDir, 'syntaxes', 'squiggle.tmLanguage.json');
const grammarText = readFileSync(grammarPath, 'utf8');
const raw = JSON.parse(grammarText);

const regexes = [];
(function walk(node, at) {
  if (Array.isArray(node)) return node.forEach((n, i) => walk(n, `${at}[${i}]`));
  if (!node || typeof node !== 'object') return;
  for (const [k, v] of Object.entries(node)) {
    if (['match', 'begin', 'end', 'while'].includes(k) && typeof v === 'string') regexes.push([`${at}.${k}`, v]);
    else walk(v, `${at}.${k}`);
  }
})(raw, '$');

let threw = false;
try {
  new onig.OnigScanner(['(unclosed']);
} catch {
  threw = true;
}
if (!threw) fail('Oniguruma accepted a broken regex, so the compile check below proves nothing');
for (const [where, re] of regexes) {
  try {
    new onig.OnigScanner([re]).dispose();
  } catch (e) {
    fail(`${where} does not compile: ${e.message}`);
  }
}
ok(`grammar parses; all ${regexes.length} regexes compile`);

const registry = new vsctm.Registry({
  onigLib: Promise.resolve({
    createOnigScanner: (patterns) => new onig.OnigScanner(patterns),
    createOnigString: (s) => new onig.OnigString(s),
  }),
  loadGrammar: async (scope) => (scope === 'source.squiggle' ? vsctm.parseRawGrammar(grammarText, grammarPath) : null),
});
const grammar = await registry.loadGrammar('source.squiggle');

/** code → lines of { text, scopes } (scopes without the root source.squiggle) */
function tokenize(code) {
  let stack = vsctm.INITIAL;
  return code.split('\n').map((line) => {
    const r = grammar.tokenizeLine(line, stack);
    stack = r.ruleStack;
    return {
      line,
      tokens: r.tokens.map((t) => ({
        text: line.slice(t.startIndex, t.endIndex),
        scopes: t.scopes.filter((s) => s !== 'source.squiggle'),
      })),
    };
  });
}

/** checks that `text` (the n-th occurrence on the line) carries a scope starting with `scope` */
function expectScope(line, text, scope, nth = 0) {
  const toks = tokenize(line)[0].tokens.filter((t) => t.text.trim() === text);
  const tok = toks[nth];
  if (!tok) return fail(`"${text}" isn't a token of: ${line}`);
  if (!tok.scopes.some((s) => s === scope || s.startsWith(scope + '.'))) {
    return fail(`"${text}" in \`${line}\` is ${tok.scopes.join(' ') || '(no scope)'}, expected ${scope}`);
  }
}

const EXPECT = [
  ['dot 0, 0, 20', 'dot', 'support.function.command'],
  ['dot(0, 0, 20)', 'dot', 'support.function.command'],
  ['  dot cos(a) * 140, sin(a * 2) * 90, 3, hue(i * 7)', 'dot', 'support.function.command'],
  ['  dot cos(a) * 140, sin(a * 2) * 90, 3, hue(i * 7)', 'cos', 'support.function'],
  ['  dot cos(a) * 140, sin(a * 2) * 90, 3, hue(i * 7)', '140', 'constant.numeric'],
  ['paper ink', 'paper', 'support.function.command'],
  ['paper ink', 'ink', 'support.constant.color'],
  ['dot 0, 0, 10, paper', 'paper', 'support.constant.color'],
  ['every frame', 'every', 'keyword.control'],
  ['every frame', 'frame', 'keyword.control'],
  ['when key "space"', 'when', 'keyword.control'],
  ['when key "space"', 'key', 'keyword.control'],
  ['when key "space"', '"', 'string.quoted.double'],
  ['when key "space"', 'space', 'string.quoted.double'],
  ['when click', 'click', 'keyword.control'],
  ['repeat 48 as i', 'repeat', 'keyword.control'],
  ['repeat 48 as i', 'as', 'keyword.control'],
  ['for c in [ember, sea]', 'in', 'keyword.control'],
  ['for c in [ember, sea]', 'sea', 'support.constant.color'],
  ['else if a and not b or c', 'else', 'keyword.control'],
  ['else if a and not b or c', 'and', 'keyword.operator.word'],
  ['else if a and not b or c', 'not', 'keyword.operator.word'],
  ['x = true', 'true', 'constant.language'],
  ['x = .5 * t + pi / turn', '.5', 'constant.numeric'],
  ['x = .5 * t + pi / turn', 't', 'constant.language'],
  ['x = .5 * t + pi / turn', 'turn', 'constant.language'],
  ['line 0, 0, mouse.x, mouse.y', 'mouse', 'constant.language'],
  ['line 0, 0, mouse.x, mouse.y', 'x', 'variable.other.property'],
  ['dot 0, 0, 20, #e4572e', '#e4572e', 'constant.other.color'],
  ['dot 0, 0, 20, #e4572e80', '#e4572e80', 'constant.other.color'],
  ['dot 0, 0, 20, #fff', '#fff', 'constant.other.color'],
  ['dot 0, 0, 20, #fffa', '#fffa', 'constant.other.color'],
  ['dot 0, 0, 20, #ffff1', '#ffff1', 'invalid.illegal'],
  ['write "say \\"hi\\"\\n", 0, 0', '\\"', 'constant.character.escape'],
  ['dot 0, 0, 20 // the middle', '//', 'comment.line.double-slash'],
  ['dot 0, 0, 20 // the middle', 'the middle', 'comment.line.double-slash'],
  ['// a whole-line comment', 'a whole-line comment', 'comment.line.double-slash'],
  ['make petal a, b', 'make', 'keyword.control'],
  ['make petal a, b', 'petal', 'entity.name.function'],
  ['make petal a, b', 'a', 'variable.parameter'],
  ['make petal a, b', 'b', 'variable.parameter'],
  ['  petal i * turn / 8', 'petal', 'entity.name.function'],
  ['  r * r', 'r', 'variable.other'],
  ['x += 2 ^ 3 % 4', '+=', 'keyword.operator.assignment'],
  ['x += 2 ^ 3 % 4', '^', 'keyword.operator.arithmetic'],
  ['if a <= b', '<=', 'keyword.operator.comparison'],
  ['x = petal(3)', 'petal', 'entity.name.function'],
];
for (const [line, text, scope] of EXPECT) expectScope(line, text, scope);
ok(`${EXPECT.length} expected scopes`);

// Valid code: every non-blank token is scoped and nothing is flagged invalid.
const fences = [...readFileSync(join(repo, 'LANGUAGE.md'), 'utf8').matchAll(/```\n([\s\S]*?)```/g)].map((m) => m[1]);
const corpus = [
  ...fences.map((code, i) => [`LANGUAGE.md block ${i + 1}`, code]),
  ...[...core.COMMANDS, ...core.BLOCKS, ...core.FUNCTIONS, ...core.CONSTANTS].map((e) => [`vocab example "${e.name}"`, e.example]),
  ...(existsSync(join(repo, 'examples'))
    ? readdirSync(join(repo, 'examples'))
        .filter((f) => f.endsWith('.sqg'))
        .map((f) => [`examples/${f}`, readFileSync(join(repo, 'examples', f), 'utf8')])
    : []),
];
let tokens = 0;
for (const [name, code] of corpus) {
  for (const { line, tokens: toks } of tokenize(code)) {
    for (const t of toks) {
      if (!t.text.trim()) continue;
      tokens++;
      if (!t.scopes.length) fail(`${name}: "${t.text}" has no scope in: ${line}`);
      // LANGUAGE.md's "Blocks" block is a summary with slashes and brackets in it, not code.
      if (t.scopes.some((s) => s.startsWith('invalid')) && !name.startsWith('LANGUAGE.md')) {
        fail(`${name}: "${t.text}" is flagged ${t.scopes.join(' ')} in: ${line}`);
      }
    }
  }
}
ok(`${corpus.length} pieces of code (${tokens} tokens) are fully scoped`);

if (print) {
  console.log('\nscopes (token → scopes, outermost first)');
  const SAMPLE = [
    fences[0],
    '',
    'dot 0, 0, 20, #e4572e80 // a see-through ember dot',
    'write "hi \\"there\\"", 0, 40, 24, sea',
    'make petal a, b',
    '  keep',
    '    spin a',
    '    box 0, 80, 40, 140, fade(ember, b)',
    'when key "space"',
    '  n = n % 9 + 1',
  ].join('\n');
  for (const { line, tokens: toks } of tokenize(SAMPLE)) {
    if (!line.trim()) continue;
    console.log(`\n  ${line}`);
    for (const t of toks) if (t.text.trim()) console.log(`    ${JSON.stringify(t.text).padEnd(26)} ${t.scopes.join(' ')}`);
  }
  console.log('');
}

// ---------------------------------------------------------------------------------------------
console.log('snippets');

const snippets = JSON.parse(readFileSync(join(pkgDir, 'snippets', 'squiggle.json'), 'utf8'));

/** A snippet body with every tab stop filled with its default, the way Tab-Tab-Tab leaves it. */
function expand(body) {
  const values = {};
  let s = body;
  for (let guard = 0; guard < 50 && /\$\{\d+[:|]/.test(s); guard++) {
    s = s
      .replace(/\$\{(\d+)\|([^|}]*)\|\}/g, (_, n, choices) => (values[n] = choices.split(',')[0]))
      .replace(/\$\{(\d+):([^${}]*)\}/g, (_, n, text) => (values[n] = text));
  }
  return s
    .replace(/\$0/g, '')
    .replace(/\$(\d+)/g, (_, n) => values[n] ?? '')
    .replace(/\t/g, '  ');
}

for (const [name, snip] of Object.entries(snippets)) {
  let code = expand(snip.body.join('\n'));
  // Blocks need a body: fill the empty line the cursor lands on.
  code = code.replace(/^(\s+)$/gm, '$1dot 0, 0, 10');
  if (/^(make)/.test(code)) code += '\npetal 1';
  try {
    const interp = new core.Interp(code);
    interp.frame(0);
    interp.frame(1.5);
  } catch (e) {
    fail(`snippet "${name}" expands to code that doesn't run:\n${code}\n    → ${e.message}`);
  }
}
const piece = expand(snippets.piece.body.join('\n'));
ok(`all ${Object.keys(snippets).length} snippets run when filled with their defaults (piece is ${core.postLength(piece)} / ${core.POST_LIMIT})`);
const shapes = core.COMMANDS.filter((c) => c.group === 'shapes').map((c) => c.name);
const missing = [...shapes, 'every frame', 'repeat', 'for … in', 'if / else', 'make', 'keep', 'when key', 'when click', 'piece'].filter((k) => !snippets[k]);
if (missing.length) fail(`missing snippets: ${missing.join(', ')}`);
else ok(`snippets cover every shape command (${shapes.join(', ')}) and every block`);

// ---------------------------------------------------------------------------------------------
console.log('language configuration');

const lc = JSON.parse(readFileSync(join(pkgDir, 'language-configuration.json'), 'utf8'));
const enter = new RegExp(lc.onEnterRules[0].beforeText);
const indents = ['every frame', 'repeat 48 as i', '  repeat n', 'for c in [ember, sea]', 'if a < b', 'else', 'else if a', 'when key "space"', 'when click', 'make petal a, b', 'keep', '  keep // comment'];
const flat = ['dot 0, 0, 20', 'keepsake = 3', 'everyone = 2', 'every = 1', 'iffy = 2', 'formula = 3', '// repeat 3', 'x = 1'];
for (const l of indents) if (!enter.test(l)) fail(`Enter after "${l}" should indent`);
for (const l of flat) if (enter.test(l)) fail(`Enter after "${l}" should not indent`);
if (!new RegExp(lc.indentationRules.decreaseIndentPattern).test('  else')) fail('else should outdent');
if (!lc.folding?.offSide) fail('folding should be offSide');
ok(`Enter indents after ${indents.length} block lines and not after ${flat.length} others; folding is offSide`);

// ---------------------------------------------------------------------------------------------
console.log('extension.js');

const SITE = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')).contributes.configuration.properties['squiggle.studioUrl'].default;
if (SITE !== core.SITE_URL) fail(`package.json studioUrl default ${SITE} != SITE_URL ${core.SITE_URL}`);

const state = { editor: undefined, settings: {}, opened: [], errors: [], infos: [], commands: {}, item: {} };
const noop = () => ({ dispose() {} });
class Uri {
  constructor(s) {
    this.s = s;
  }
  static parse(s) {
    return new Uri(s);
  }
  toString() {
    return this.s;
  }
}
const vscodeStub = {
  Uri,
  StatusBarAlignment: { Left: 1, Right: 2 },
  ThemeColor: class {
    constructor(id) {
      this.id = id;
    }
  },
  window: {
    get activeTextEditor() {
      return state.editor;
    },
    get visibleTextEditors() {
      return state.editor ? [state.editor] : [];
    },
    createStatusBarItem: () =>
      Object.assign(state.item, { show: () => (state.item.visible = true), hide: () => (state.item.visible = false), dispose() {} }),
    showErrorMessage: async (m) => void state.errors.push(m),
    showWarningMessage: async (m) => void state.errors.push(m),
    showInformationMessage: async (m) => void state.infos.push(m),
    onDidChangeActiveTextEditor: (fn) => ((state.onActive = fn), noop()),
  },
  workspace: {
    getConfiguration: () => ({
      get: (k) => (k in state.settings ? state.settings[k] : SITE),
      inspect: () => ({ defaultValue: SITE }),
    }),
    onDidChangeTextDocument: noop,
    onDidOpenTextDocument: noop,
    openTextDocument: async () => state.editor.document,
  },
  commands: {
    registerCommand: (id, fn) => ((state.commands[id] = fn), noop()),
    executeCommand: async () => {},
  },
  env: { openExternal: async (uri) => (state.opened.push(uri.toString()), true) },
};
const load = Module._load;
Module._load = function (request, ...rest) {
  return request === 'vscode' ? vscodeStub : load.call(this, request, ...rest);
};
const ext = require('../extension.js');

/** a fake editor on `text`, with an optional [start, end) selection in offsets */
function editorOn(text, sel = [0, 0], languageId = 'squiggle') {
  return {
    document: {
      uri: new Uri('file:///piece.sqg'),
      languageId,
      getText: (range) => (range ? text.slice(range.start, range.end) : text),
    },
    selection: { start: sel[0], end: sel[1], isEmpty: sel[0] === sel[1] },
  };
}
const linkPayload = (url) => new URL(url).searchParams.get('c');
const inflate = (payload) => inflateRawSync(Buffer.from(payload, 'base64url')).toString('utf8');

const context = { subscriptions: [] };
state.editor = editorOn(fences[0]);
ext.activate(context);
const open = state.commands['squiggle.openInStudio'];
if (!open) fail('squiggle.openInStudio is not registered');

// whole file
await open();
const url1 = state.opened.at(-1);
if (!url1?.startsWith(`${SITE}/studio?c=`)) fail(`unexpected link ${url1}`);
const payload1 = linkPayload(url1);
if (inflate(payload1) !== fences[0]) fail('whole-file payload does not inflate back to the code');
if ((await core.decodeCode(payload1)) !== fences[0]) fail("the studio's decodeCode does not read the whole-file payload");
if (inflate(await core.encodeCode(fences[0])) !== fences[0]) fail("this check's inflate can't read core encodeCode's payload");
ok(`whole file → ${url1.length}-char link; inflateRawSync and core decodeCode both give back the code`);
if (print) console.log(`    ${url1}`);

// selection, a custom studio address with a trailing slash, CRLF, non-Latin text
const code2 = 'paper night\r\nwrite "日本 ✨ ñ", 0, 0, 40, ember\r\n';
state.editor = editorOn('// before\n' + code2 + '// after', [10, 10 + code2.length]);
state.settings.studioUrl = 'http://localhost:8787/';
await open();
const url2 = state.opened.at(-1);
const want2 = code2.replace(/\r\n/g, '\n');
if (!url2.startsWith('http://localhost:8787/studio?c=')) fail(`custom studio address ignored: ${url2}`);
if (inflate(linkPayload(url2)) !== want2 || (await core.decodeCode(linkPayload(url2))) !== want2) fail('selection payload does not decode back');
ok('selection only, with CRLF and non-Latin text, decodes back (CRLF → LF); studioUrl setting honored');
delete state.settings.studioUrl;

// too long for a link: random text barely compresses
const before = state.opened.length;
let noise = '';
let seed = 7;
while (noise.length < 9000) {
  seed = (seed * 1103515245 + 12345) % 2 ** 31;
  noise += String.fromCharCode(33 + (seed % 90));
}
state.editor = editorOn(`say "${noise.replace(/["\\]/g, '')}"`);
await open();
if (state.opened.length !== before) fail('a link over 8,000 characters was opened');
else if (!/over the 8,000/.test(state.errors.at(-1) ?? '')) fail(`unexpected message: ${state.errors.at(-1)}`);
else ok(`a piece whose link would be too long shows: "${state.errors.at(-1)}"`);

// over 20,000 characters
state.editor = editorOn('dot 0, 0, 1\n'.repeat(2000));
await open();
if (state.opened.length !== before || !/20,000/.test(state.errors.at(-1) ?? '')) fail('a piece over 20,000 characters was not refused');
else ok(`a piece over 20,000 characters shows: "${state.errors.at(-1)}"`);

// status bar: same numbers as core's postLength
const samples = [fences[0], code2, '  \n\ndot 0, 0, 20   \n\n', 'write "🎨🎨", 0, 0', '‘quoted’ — dash … ellipsis', 'x'.repeat(300), ''];
for (const s of samples) {
  if (ext.postLength(s) !== core.postLength(s)) fail(`postLength(${JSON.stringify(s.slice(0, 30))}) = ${ext.postLength(s)}, core says ${core.postLength(s)}`);
  if (ext.postText(s) !== core.postText(s)) fail(`postText differs from core for ${JSON.stringify(s.slice(0, 30))}`);
}
ok(`postLength and postText match core on ${samples.length} samples`);

state.editor = editorOn(fences[0]);
state.onActive();
const n0 = core.postLength(fences[0]);
if (state.item.text !== `${n0} / 280` || !state.item.visible || !state.item.tooltip.includes('· fits in a post')) {
  fail(`status bar shows "${state.item.text}" / "${state.item.tooltip}"`);
} else ok(`status bar: "${state.item.text}", tooltip "${state.item.tooltip.split('\n')[0]}"`);
state.editor = editorOn('x = 1\n'.repeat(60));
state.onActive();
if (state.item.text !== '359 / 280' || state.item.tooltip.includes('fits') || state.item.backgroundColor?.id !== 'statusBarItem.warningBackground') {
  fail(`over-limit status bar shows "${state.item.text}" / "${state.item.tooltip}"`);
} else ok(`over the limit: "${state.item.text}", warning background, tooltip "${state.item.tooltip.split('\n')[0]}"`);
state.editor = editorOn('x', [0, 0], 'javascript');
state.onActive();
if (state.item.visible) fail('status bar item should hide outside .sqg files');
else ok('status bar item hides outside .sqg files');
if (state.item.command?.command !== 'squiggle.openInStudio') fail('clicking the status bar item should open the studio');

// ---------------------------------------------------------------------------------------------
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
