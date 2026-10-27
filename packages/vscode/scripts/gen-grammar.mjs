#!/usr/bin/env node
// Generates every file in this extension that depends on Squiggle's vocabulary, so the editor
// can never drift from the language:
//
//   syntaxes/squiggle.tmLanguage.json   the TextMate grammar
//   language-configuration.json         comments, brackets, indent on Enter, folding
//   snippets/squiggle.json              block snippets, one per shape command, and `piece`
//
// Source of truth: packages/core/src/vocab.ts (plus site.ts for the default studio address,
// which is copied into package.json). Run it with `npm run gen -w squiggle-vscode`.
//
// Node 22.18+ imports vocab.ts directly (type stripping). On an older Node, or with
// SQUIGGLE_VOCAB_FROM_TEXT=1, the lists are read out of the file text instead.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const coreDir = join(pkgDir, '..', 'core', 'src');

// ---------------------------------------------------------------------------------------------
// Loading the vocabulary

async function loadVocab() {
  const file = join(coreDir, 'vocab.ts');
  if (!process.env.SQUIGGLE_VOCAB_FROM_TEXT) {
    try {
      return await import(pathToFileURL(file).href);
    } catch (err) {
      console.warn(`could not import vocab.ts (${err.message.split('\n')[0]}); reading it as text`);
    }
  }
  return vocabFromText(readFileSync(file, 'utf8'));
}

/** The text of the `[...]` or `{...}` literal that follows `export const NAME ... =`. */
function literal(src, name) {
  const at = src.search(new RegExp(`export const ${name}\\b[^=]*=\\s*`));
  if (at < 0) throw new Error(`vocab.ts has no ${name}`);
  let i = src.indexOf('=', at) + 1;
  while (src[i] !== '[' && src[i] !== '{') i++; // skips "new Set(" too
  const open = src[i];
  const close = open === '[' ? ']' : '}';
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === "'" || c === '"' || c === '`') {
      for (j++; src[j] !== c; j++) if (src[j] === '\\') j++;
    } else if (c === open || c === '[' || c === '{') depth++;
    else if (c === close || c === ']' || c === '}') {
      depth--;
      if (depth === 0) return src.slice(i, j + 1);
    }
  }
  throw new Error(`${name} never closes`);
}

const unquote = (s) => s.slice(1, -1).replace(/\\n/g, '\n').replace(/\\(.)/g, '$1');
const STR = String.raw`'(?:[^'\\]|\\.)*'`;

function entries(src, name) {
  const body = literal(src, name);
  return body
    .split(/(?=\{\s*name:)/)
    .slice(1)
    .map((chunk) => {
      const field = (key) => {
        const m = new RegExp(`\\b${key}:\\s*(${STR})`).exec(chunk);
        return m ? unquote(m[1]) : undefined;
      };
      return { name: field('name'), group: field('group'), usage: field('usage'), summary: field('summary'), example: field('example') };
    });
}

function vocabFromText(src) {
  const strings = (name) => [...literal(src, name).matchAll(new RegExp(STR, 'g'))].map((m) => unquote(m[0]));
  const keys = (name) => [...literal(src, name).matchAll(/^\s*([A-Za-z_]\w*):/gm)].map((m) => m[1]);
  const posts = /export const POST_LIMIT = (\d+)/.exec(src);
  return {
    KEYWORDS: strings('KEYWORDS'),
    BLOCK_WORDS: strings('BLOCK_WORDS'),
    COMMANDS: entries(src, 'COMMANDS'),
    BLOCKS: entries(src, 'BLOCKS'),
    FUNCTIONS: entries(src, 'FUNCTIONS'),
    CONSTANTS: entries(src, 'CONSTANTS'),
    PALETTE: Object.fromEntries(keys('PALETTE').map((k) => [k, ''])),
    KEY_NAMES: new Set(
      strings('KEY_NAMES')
        .filter((s) => s && !s.includes('abcdef'))
        .concat('abcdefghijklmnopqrstuvwxyz0123456789'.split('')),
    ),
    POST_LIMIT: posts ? Number(posts[1]) : undefined,
  };
}

function siteUrl() {
  const m = /export const SITE_URL = '([^']+)'/.exec(readFileSync(join(coreDir, 'site.ts'), 'utf8'));
  if (!m) throw new Error('site.ts has no SITE_URL');
  return m[1];
}

// ---------------------------------------------------------------------------------------------

const V = await loadVocab();
const KEYWORDS = [...V.KEYWORDS];
const BLOCK_WORDS = [...V.BLOCK_WORDS];
const COMMANDS = V.COMMANDS.map((c) => c.name);
const FUNCTIONS = V.FUNCTIONS.map((f) => f.name);
const CONSTANTS = V.CONSTANTS.map((c) => c.name);
const PALETTE = Object.keys(V.PALETTE);

const OPERATOR_WORDS = ['and', 'or', 'not'];
const BOOLEANS = ['true', 'false'];
for (const w of [...OPERATOR_WORDS, ...BOOLEANS, ...BLOCK_WORDS]) {
  if (!KEYWORDS.includes(w)) throw new Error(`expected "${w}" in KEYWORDS`);
}
const CONTROL = KEYWORDS.filter((k) => !OPERATOR_WORDS.includes(k) && !BOOLEANS.includes(k));
/** Blocks written as two words: every frame, when key, when click. */
const TWO_WORD = V.BLOCKS.map((b) => b.name.split(' ')).filter((w) => w.length === 2);
for (const [a, b] of TWO_WORD) {
  if (!KEYWORDS.includes(a) || !KEYWORDS.includes(b)) throw new Error(`"${a} ${b}" isn't made of keywords`);
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Longest first, so a name never stops at a shorter one that prefixes it. */
const alt = (list) => [...new Set(list)].sort((a, b) => b.length - a.length || a.localeCompare(b)).map(escapeRe).join('|');
const word = (list) => `\\b(?:${alt(list)})\\b`;
const NAME = '[A-Za-z_][A-Za-z0-9_]*';
const RESERVED = [...KEYWORDS, ...COMMANDS, ...FUNCTIONS, ...CONSTANTS, ...PALETTE];

// ---------------------------------------------------------------------------------------------
// The grammar

const S = (name) => `${name}.squiggle`;

const grammar = {
  information_for_contributors: [
    'Generated by packages/vscode/scripts/gen-grammar.mjs from packages/core/src/vocab.ts.',
    'Do not edit by hand: change the vocabulary or the script, then run `npm run gen -w squiggle-vscode`.',
  ],
  $schema: 'https://raw.githubusercontent.com/martinring/tmlanguage/master/tmlanguage.json',
  name: 'Squiggle',
  scopeName: 'source.squiggle',
  fileTypes: ['sqg'],
  patterns: [
    { include: '#comment' },
    { include: '#make' },
    { include: '#block-header' },
    { include: '#command' },
    { include: '#user-command' },
    { include: '#expression' },
  ],
  repository: {
    comment: {
      name: S('comment.line.double-slash'),
      begin: '//',
      beginCaptures: { 0: { name: S('punctuation.definition.comment') } },
      end: '$',
    },

    // make name a, b: the name is a new command, the rest are its inputs.
    make: {
      name: S('meta.function'),
      begin: `^\\s*(make)\\b(?:[ \\t]+(${NAME}))?`,
      beginCaptures: {
        1: { name: S('keyword.control.make') },
        2: { name: S('entity.name.function') },
      },
      end: '$',
      patterns: [
        { include: '#comment' },
        { match: NAME, name: S('variable.parameter') },
        { match: ',', name: S('punctuation.separator.parameters') },
      ],
    },

    // every frame, when key, when click
    'block-header': {
      patterns: TWO_WORD.map(([a, b]) => ({
        match: `^\\s*(${escapeRe(a)})[ \\t]+(${escapeRe(b)})\\b`,
        captures: {
          1: { name: S(`keyword.control.${a}`) },
          2: { name: S(`keyword.control.${a}`) },
        },
      })),
    },

    // Built-in commands lead their line: dot 0, 0, 20 (or dot(0, 0, 20)).
    command: {
      match: `^\\s*\\b(${alt(COMMANDS)})\\b(?=[ \\t(]|$)`,
      captures: { 1: { name: S('support.function.command') } },
    },

    // A command made with `make`, called at the start of a line: petal i * turn / 8.
    // Mirrors the parser: a name followed by something that starts an argument.
    'user-command': {
      match:
        `^\\s*(?!(?:${alt(RESERVED)})\\b)(${NAME})` +
        `(?=[ \\t]+(?:[0-9"#]|\\.[0-9]|\\[|\\(|-(?![=\\s])|(?!(?:and|or|as|in)\\b)[A-Za-z_]))`,
      captures: { 1: { name: S('entity.name.function') } },
    },

    expression: {
      patterns: [
        { include: '#comment' },
        { include: '#string' },
        { include: '#color' },
        { include: '#number' },
        { include: '#keyword' },
        { include: '#builtin' },
        { include: '#call' },
        { include: '#property' },
        { include: '#name' },
        { include: '#operator' },
        { include: '#punctuation' },
        { include: '#illegal' },
      ],
    },

    string: {
      name: S('string.quoted.double'),
      begin: '"',
      beginCaptures: { 0: { name: S('punctuation.definition.string.begin') } },
      end: '"|$',
      endCaptures: { 0: { name: S('punctuation.definition.string.end') } },
      patterns: [{ match: '\\\\.', name: S('constant.character.escape') }],
    },

    color: {
      patterns: [
        {
          match: '#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![A-Za-z0-9_])',
          name: S('constant.other.color.rgb-value.hex'),
        },
        { match: '#[A-Za-z0-9_]*', name: S('invalid.illegal.color') },
      ],
    },

    number: {
      patterns: [
        { match: `(?:\\d+(?:\\.\\d+)?|\\.\\d+)${NAME}`, name: S('invalid.illegal.number') },
        { match: '(?:\\d+(?:\\.\\d+)?|\\.\\d+)', name: S('constant.numeric.decimal') },
      ],
    },

    keyword: {
      patterns: [
        { match: word(OPERATOR_WORDS), name: S('keyword.operator.word') },
        { match: word(BOOLEANS), name: S('constant.language.boolean') },
        { match: word(CONTROL), name: S('keyword.control') },
      ],
    },

    builtin: {
      patterns: [
        { match: word(FUNCTIONS), name: S('support.function.builtin') },
        { match: word(CONSTANTS), name: S('constant.language') },
        { match: word(PALETTE), name: S('support.constant.color') },
      ],
    },

    call: {
      match: `\\b(${NAME})(?=\\()`,
      captures: { 1: { name: S('entity.name.function') } },
    },

    property: {
      match: `(\\.)(${NAME})`,
      captures: {
        1: { name: S('punctuation.accessor') },
        2: { name: S('variable.other.property') },
      },
    },

    name: { match: NAME, name: S('variable.other') },

    operator: {
      patterns: [
        { match: '[+\\-*/]=', name: S('keyword.operator.assignment.compound') },
        { match: '==|!=|<=|>=|<|>', name: S('keyword.operator.comparison') },
        { match: '=', name: S('keyword.operator.assignment') },
        { match: '[+\\-*/%^]', name: S('keyword.operator.arithmetic') },
      ],
    },

    punctuation: {
      patterns: [
        { match: '\\(', name: S('punctuation.section.parens.begin') },
        { match: '\\)', name: S('punctuation.section.parens.end') },
        { match: '\\[', name: S('punctuation.section.brackets.begin') },
        { match: '\\]', name: S('punctuation.section.brackets.end') },
        { match: ',', name: S('punctuation.separator.comma') },
      ],
    },

    // Characters the lexer refuses, with the hint it would give: ' : ; { } & | !
    illegal: { match: "[':;{}&|!]", name: S('invalid.illegal.character') },
  },
};

// ---------------------------------------------------------------------------------------------
// Language configuration

/** A line that starts a block: every frame, repeat …, for … in …, if …, else, when …, make …, keep. */
const header = BLOCK_WORDS.map((w) => {
  const two = TWO_WORD.filter(([a]) => a === w);
  // every only starts a block as "every frame"; when takes key or click.
  if (two.length && w === 'every') return two.map(([a, b]) => `${a}\\s+${b}`).join('|');
  return w;
}).join('|');

const languageConfiguration = {
  comments: { lineComment: '//' },
  brackets: [
    ['(', ')'],
    ['[', ']'],
  ],
  colorizedBracketPairs: [
    ['(', ')'],
    ['[', ']'],
  ],
  autoClosingPairs: [
    { open: '(', close: ')' },
    { open: '[', close: ']' },
    { open: '"', close: '"', notIn: ['string', 'comment'] },
  ],
  autoCloseBefore: ';:.,=)]} \t\n',
  surroundingPairs: [
    ['(', ')'],
    ['[', ']'],
    ['"', '"'],
  ],
  wordPattern: '#[0-9a-fA-F]+|-?\\d*\\.\\d+|-?\\d+|[A-Za-z_][A-Za-z0-9_]*',
  indentationRules: {
    increaseIndentPattern: `^\\s*(?:${header})\\b.*$`,
    decreaseIndentPattern: '^\\s*else\\b.*$',
  },
  onEnterRules: [
    {
      beforeText: `^\\s*(?:${header})\\b.*$`,
      action: { indent: 'indent' },
    },
  ],
  folding: { offSide: true },
};

// ---------------------------------------------------------------------------------------------
// Snippets

const block = (name) => {
  const b = V.BLOCKS.find((x) => x.name === name);
  if (!b) throw new Error(`no block "${name}" in vocab.ts`);
  return b.summary;
};
const keyChoices = [...V.KEY_NAMES].filter((k) => k.length > 1);

const snippets = {
  'every frame': {
    prefix: ['every', 'frame'],
    body: ['every frame', '\t$0'],
    description: block('every frame'),
  },
  repeat: {
    prefix: 'repeat',
    body: ['repeat ${1:12} as ${2:i}', '\t$0'],
    description: block('repeat'),
  },
  'for … in': {
    prefix: ['for', 'forin'],
    body: ['for ${1:c} in ${2:[ember, ochre, moss, sea]}', '\t$0'],
    description: block('for'),
  },
  if: {
    prefix: 'if',
    body: ['if ${1:mouse.x > 0}', '\t$0'],
    description: block('if'),
  },
  'if / else': {
    prefix: ['if', 'ifelse'],
    body: ['if ${1:mouse.x > 0}', '\t$2', 'else', '\t$0'],
    description: block('if'),
  },
  make: {
    prefix: 'make',
    body: ['make ${1:petal} ${2:a}', '\t$0'],
    description: block('make'),
  },
  keep: {
    prefix: 'keep',
    body: ['keep', '\t$0'],
    description: block('keep'),
  },
  'when key': {
    prefix: ['when', 'whenkey'],
    body: [`when key "\${1|${keyChoices.join(',')}|}"`, '\t$0'],
    description: block('when key'),
  },
  'when click': {
    prefix: ['when', 'whenclick'],
    body: ['when click', '\t$0'],
    description: block('when click'),
  },
};

/** Starting values for the arguments of the shape snippets, by the name the usage gives them. */
const DEFAULTS = {
  x: '0', y: '0', size: '40', w: '160', h: '100',
  x1: '-120', y1: '-80', x2: '120', y2: '80',
  text: '"hello"', points: '[(-120, -80), (0, 120), (120, -80)]', color: 'ember',
};

for (const c of V.COMMANDS.filter((c) => c.group === 'shapes')) {
  // "write text, x, y [, size] [, color]" → required: text, x, y; optional: size, color
  const m = /^(\w+)\s+([^[]*?)\s*((?:\[,\s*\w+\]\s*)*)$/.exec(c.usage);
  if (!m || m[1] !== c.name) throw new Error(`can't read the usage of ${c.name}: ${c.usage}`);
  const required = m[2].split(',').map((s) => s.trim()).filter(Boolean);
  const optional = [...m[3].matchAll(/\[,\s*(\w+)\]/g)].map((x) => x[1]);
  let n = 0;
  const arg = (a) => {
    if (!(a in DEFAULTS)) throw new Error(`no snippet default for "${a}" (${c.usage})`);
    return `\${${++n}:${DEFAULTS[a]}}`;
  };
  let body = `${c.name} ${required.map(arg).join(', ')}`;
  for (const a of optional) {
    const outer = ++n;
    body += `\${${outer}:, ${arg(a)}}`;
  }
  snippets[c.name] = { prefix: c.name, body: [`${body}$0`], description: `${c.usage}\n${c.summary}` };
}

snippets.piece = {
  prefix: 'piece',
  body: [
    '// ${1:a new piece}',
    'paper ${2:night}',
    'width 3',
    'every frame',
    '\trepeat ${3:24} as i',
    '\t\ta = i / $3 * turn + t * ${4:0.4}',
    '\t\tr = 110 + sin(t * 2 + i / 2) * 50',
    '\t\tdot polar(r, a), 8, hue(i * 15 + t * 40)',
    '\tring 0, 0, 60 + sin(t) * 20, ${5:ember}',
    '$0',
  ],
  description: 'A small animated piece to start from: a ring of dots that breathes and turns.',
};

// ---------------------------------------------------------------------------------------------
// Keep the hand-written files in step with core

const SITE_URL = siteUrl();
const pkgPath = join(pkgDir, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const studioSetting = pkg.contributes.configuration.properties['squiggle.studioUrl'];
if (studioSetting.default !== SITE_URL) {
  studioSetting.default = SITE_URL;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`package.json: squiggle.studioUrl now defaults to ${SITE_URL}`);
}
const ext = readFileSync(join(pkgDir, 'extension.js'), 'utf8');
const extLimit = /const POST_LIMIT = (\d+);/.exec(ext);
if (V.POST_LIMIT !== undefined && (!extLimit || Number(extLimit[1]) !== V.POST_LIMIT)) {
  throw new Error(`extension.js has POST_LIMIT ${extLimit?.[1]}, vocab.ts has ${V.POST_LIMIT}: update extension.js`);
}

// ---------------------------------------------------------------------------------------------

/** JSON.stringify with 2-space indents, keeping short arrays of plain values on one line. */
function pretty(value, indent = '') {
  if (Array.isArray(value)) {
    const flat = JSON.stringify(value);
    if (value.every((v) => v === null || typeof v !== 'object' || (Array.isArray(v) && v.every((x) => typeof x !== 'object'))) && flat.length <= 72) {
      return flat.replace(/","/g, '", "').replace(/\],\[/g, '], [');
    }
    const inner = indent + '  ';
    return `[\n${value.map((v) => inner + pretty(v, inner)).join(',\n')}\n${indent}]`;
  }
  if (value && typeof value === 'object') {
    const inner = indent + '  ';
    const keys = Object.keys(value);
    if (!keys.length) return '{}';
    return `{\n${keys.map((k) => `${inner}${JSON.stringify(k)}: ${pretty(value[k], inner)}`).join(',\n')}\n${indent}}`;
  }
  return JSON.stringify(value);
}

const write = (rel, data) => {
  const file = join(pkgDir, rel);
  const text = pretty(data) + '\n';
  if (JSON.stringify(JSON.parse(text)) !== JSON.stringify(data)) throw new Error(`pretty() changed ${rel}`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
  console.log(`wrote ${rel}`);
};

write('syntaxes/squiggle.tmLanguage.json', grammar);
write('language-configuration.json', languageConfiguration);
write('snippets/squiggle.json', snippets);
