var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// ../core/src/errors.ts
function formatError(err, source) {
  const lines = source.split(/\r?\n/);
  const text = lines[err.line - 1] ?? "";
  const num3 = String(err.line);
  const pad = " ".repeat(num3.length);
  const caretCol = Math.max(1, Math.min(err.col, text.length + 1));
  const caretLen = Math.max(1, Math.min(err.len, Math.max(1, text.length - caretCol + 1)));
  const out = [
    `line ${err.line}, col ${err.col}: ${err.message}`,
    `  ${num3} | ${text.replace(/\t/g, " ")}`,
    `  ${pad} | ${" ".repeat(caretCol - 1)}${"^".repeat(caretLen)}`
  ];
  if (err.hint) out.push(`try: ${err.hint}`);
  return out.join("\n");
}
function toErrorInfo(e) {
  if (e instanceof SquiggleError) return e.toJSON();
  const message = e instanceof Error ? e.message : String(e);
  return { kind: "runtime", message: `something broke inside Squiggle: ${message}`, line: 1, col: 1, len: 1 };
}
function distance(a, b) {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_2, j) => i === 0 ? j : j === 0 ? i : 0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[m][n];
}
function closest(name, candidates) {
  let best;
  let bestD = Infinity;
  const lower = name.toLowerCase();
  for (const c of candidates) {
    const d = distance(lower, c.toLowerCase());
    if (d < bestD || d === bestD && best !== void 0 && c.length < best.length) {
      best = c;
      bestD = d;
    }
  }
  if (best === void 0) return void 0;
  const limit = name.length <= 3 ? 1 : name.length <= 6 ? 2 : 3;
  return bestD <= limit ? best : void 0;
}
var SquiggleError;
var init_errors = __esm({
  "../core/src/errors.ts"() {
    "use strict";
    SquiggleError = class extends Error {
      kind;
      line;
      col;
      len;
      hint;
      constructor(kind, message, where, hint) {
        super(message);
        this.name = "SquiggleError";
        this.kind = kind;
        this.line = where.line;
        this.col = where.col;
        this.len = Math.max(1, where.len ?? 1);
        this.hint = hint;
      }
      toJSON() {
        return { kind: this.kind, message: this.message, line: this.line, col: this.col, len: this.len, hint: this.hint };
      }
    };
  }
});

// ../core/src/lexer.ts
function lex(source) {
  const src = source.replace(/\r\n?/g, "\n");
  const tokens = [];
  const comments = [];
  const indents = [""];
  let depth = 0;
  const openers = [];
  const lines = src.split("\n");
  let offset = 0;
  const push = (t) => tokens.push(t);
  for (let li = 0; li < lines.length; li++) {
    const raw = lines[li];
    const lineNo = li + 1;
    const lineStart = offset;
    offset += raw.length + 1;
    let i = 0;
    while (i < raw.length && isBlank(raw[i])) i++;
    const rest = raw.slice(i);
    const blank = rest.length === 0 || rest.startsWith("//");
    if (blank) {
      if (rest.startsWith("//")) comments.push({ line: lineNo, col: i + 1, text: rest.slice(2), own: true });
      continue;
    }
    if (depth === 0) {
      const indent = raw.slice(0, i).replace(/ /g, " ");
      const top = indents[indents.length - 1];
      if (indent !== top) {
        if (indent.startsWith(top)) {
          indents.push(indent);
          push({ type: "indent", text: "", line: lineNo, col: 1, pos: lineStart, space: true });
        } else if (top.startsWith(indent)) {
          while (indents.length > 1 && indents[indents.length - 1] !== indent && indents[indents.length - 1].startsWith(indent)) {
            indents.pop();
            push({ type: "dedent", text: "", line: lineNo, col: 1, pos: lineStart, space: true });
          }
          if (indents[indents.length - 1] !== indent) {
            throw new SquiggleError(
              "syntax",
              "this line's indent doesn't line up with any block above it",
              { line: lineNo, col: 1, len: Math.max(1, i) },
              `line it up with the line that starts the block it belongs to`
            );
          }
        } else {
          throw new SquiggleError(
            "syntax",
            "this indent mixes tabs and spaces",
            { line: lineNo, col: 1, len: Math.max(1, i) },
            "indent with spaces only (two per level is the house style)"
          );
        }
      }
    }
    let space = true;
    while (i < raw.length) {
      const c = raw[i];
      const col2 = i + 1;
      const pos = lineStart + i;
      if (isBlank(c)) {
        i++;
        space = true;
        continue;
      }
      if (c === "/" && raw[i + 1] === "/") {
        comments.push({ line: lineNo, col: col2, text: raw.slice(i + 2), own: false });
        break;
      }
      const base = { line: lineNo, col: col2, pos, space };
      space = false;
      if (isDigit(c) || c === "." && isDigit(raw[i + 1] ?? "")) {
        let j = i;
        while (j < raw.length && isDigit(raw[j])) j++;
        if (raw[j] === "." && isDigit(raw[j + 1] ?? "")) {
          j++;
          while (j < raw.length && isDigit(raw[j])) j++;
        }
        if (j < raw.length && isNameStart(raw[j])) {
          let k = j;
          while (k < raw.length && isNameChar(raw[k])) k++;
          throw new SquiggleError(
            "syntax",
            `"${raw.slice(i, k)}" starts like a number but has letters stuck to it`,
            { line: lineNo, col: col2, len: k - i },
            `put a space or a * between them, like ${raw.slice(i, j)} * ${raw.slice(j, k)}`
          );
        }
        const text = raw.slice(i, j);
        push({ ...base, type: "num", text, value: parseFloat(text) });
        i = j;
        continue;
      }
      if (isNameStart(c)) {
        let j = i;
        while (j < raw.length && isNameChar(raw[j])) j++;
        const text = raw.slice(i, j);
        push({ ...base, type: "name", text });
        i = j;
        continue;
      }
      if (c === '"') {
        let j = i + 1;
        let value = "";
        let closed = false;
        while (j < raw.length) {
          const d = raw[j];
          if (d === "\\" && j + 1 < raw.length) {
            const e = raw[j + 1];
            value += e === "n" ? "\n" : e;
            j += 2;
            continue;
          }
          if (d === '"') {
            closed = true;
            j++;
            break;
          }
          value += d;
          j++;
        }
        if (!closed) {
          throw new SquiggleError("syntax", "this text never ends", { line: lineNo, col: col2, len: raw.length - i }, 'add a closing " at the end of the text');
        }
        push({ ...base, type: "str", text: raw.slice(i, j), value });
        i = j;
        continue;
      }
      if (c === "#") {
        let j = i + 1;
        while (j < raw.length && isNameChar(raw[j])) j++;
        const hex = raw.slice(i + 1, j);
        if (![3, 4, 6, 8].includes(hex.length) || ![...hex].every(isHex)) {
          throw new SquiggleError(
            "syntax",
            `"${raw.slice(i, j) || "#"}" isn't a color`,
            { line: lineNo, col: col2, len: Math.max(1, j - i) },
            "write colors as # plus 3 or 6 hex digits, like #e4572e (add 2 more for see-through: #e4572e80)"
          );
        }
        push({ ...base, type: "color", text: raw.slice(i, j), value: hex.toLowerCase() });
        i = j;
        continue;
      }
      const op = OPS.find((o) => raw.startsWith(o, i));
      if (op) {
        const tok = { ...base, type: "op", text: op };
        if (op === "(" || op === "[") {
          depth++;
          openers.push(tok);
        } else if (op === ")" || op === "]") {
          const opener = openers.pop();
          if (!opener) {
            throw new SquiggleError("syntax", `there's a ${op} here with nothing to close`, { line: lineNo, col: col2 }, "remove it, or add the matching opening bracket");
          }
          const want = opener.text === "(" ? ")" : "]";
          if (want !== op) {
            throw new SquiggleError(
              "syntax",
              `this ${op} doesn't match the ${opener.text} on line ${opener.line}`,
              { line: lineNo, col: col2 },
              `close it with ${want}`
            );
          }
          depth--;
        }
        push(tok);
        i += op.length;
        continue;
      }
      const hint = c === "'" ? 'text goes in double quotes, like "hello"' : c === ":" ? "blocks don't need a colon; end the line and indent the next one" : c === "{" || c === "}" ? "Squiggle uses indentation for blocks, not braces" : c === ";" ? "put each command on its own line" : c === "&" || c === "|" ? "use the words and / or" : c === "!" ? 'use not, or != for "is not equal"' : void 0;
      throw new SquiggleError("syntax", `Squiggle doesn't use "${c}"`, { line: lineNo, col: col2 }, hint);
    }
    if (depth === 0) {
      push({ type: "newline", text: "", line: lineNo, col: raw.length + 1, pos: lineStart + raw.length, space: false });
    }
  }
  if (depth > 0) {
    const opener = openers[openers.length - 1];
    throw new SquiggleError(
      "syntax",
      `this ${opener.text} is never closed`,
      { line: opener.line, col: opener.col },
      `add a ${opener.text === "(" ? ")" : "]"} to close it`
    );
  }
  const endLine = lines.length;
  const endPos = src.length;
  if (tokens.length && tokens[tokens.length - 1].type !== "newline") {
    tokens.push({ type: "newline", text: "", line: endLine, col: 1, pos: endPos, space: false });
  }
  while (indents.length > 1) {
    indents.pop();
    tokens.push({ type: "dedent", text: "", line: endLine, col: 1, pos: endPos, space: true });
  }
  tokens.push({ type: "eof", text: "", line: endLine, col: 1, pos: endPos, space: true });
  return { tokens, comments };
}
var OPS, isDigit, isNameStart, isNameChar, isHex, isBlank;
var init_lexer = __esm({
  "../core/src/lexer.ts"() {
    "use strict";
    init_errors();
    OPS = ["+=", "-=", "*=", "/=", "==", "!=", "<=", ">=", "+", "-", "*", "/", "%", "^", "=", "<", ">", "(", ")", "[", "]", ",", "."];
    isDigit = (c) => c >= "0" && c <= "9";
    isNameStart = (c) => c >= "a" && c <= "z" || c >= "A" && c <= "Z" || c === "_";
    isNameChar = (c) => isNameStart(c) || isDigit(c);
    isHex = (c) => /[0-9a-fA-F]/.test(c);
    isBlank = (c) => c === " " || c === "	" || c === "\xA0";
  }
});

// ../core/src/vocab.ts
var KEYWORDS, BLOCK_WORDS, COMMANDS, FUNCTIONS, CONSTANTS, PALETTE, COMMAND_NAMES, FUNCTION_NAMES, CONSTANT_NAMES, KEYWORD_NAMES, RESERVED, SYNONYMS, KEY_NAMES, LIMITS, SIZE, POST_LIMIT;
var init_vocab = __esm({
  "../core/src/vocab.ts"() {
    "use strict";
    KEYWORDS = [
      "every",
      "frame",
      "repeat",
      "as",
      "for",
      "in",
      "if",
      "else",
      "when",
      "key",
      "click",
      "make",
      "keep",
      "and",
      "or",
      "not",
      "true",
      "false"
    ];
    BLOCK_WORDS = ["every", "repeat", "for", "if", "else", "when", "make", "keep"];
    COMMANDS = [
      {
        name: "dot",
        group: "shapes",
        numbers: ["x", "y", "size"],
        optional: ["color"],
        usage: "dot x, y, size [, color]",
        summary: "A filled circle. size is the radius in pixels.",
        example: "paper bone\ndot 0, 0, 90, ember\ndot 60, 50, 24, ink"
      },
      {
        name: "ring",
        group: "shapes",
        numbers: ["x", "y", "size"],
        optional: ["color"],
        usage: "ring x, y, size [, color]",
        summary: "An outlined circle, drawn with the current width.",
        example: "width 6\nrepeat 6 as i\n  ring 0, 0, 20 + i * 30, mix(ember, sky, i / 5)"
      },
      {
        name: "box",
        group: "shapes",
        numbers: ["x", "y", "w", "h"],
        optional: ["color"],
        usage: "box x, y, w, h [, color]",
        summary: "A filled rectangle centered on x, y.",
        example: "box 0, 0, 260, 160, moss\nbox 0, 0, 120, 220, fade(ember, 0.8)"
      },
      {
        name: "line",
        group: "shapes",
        numbers: ["x1", "y1", "x2", "y2"],
        optional: ["color"],
        usage: "line x1, y1, x2, y2 [, color]",
        summary: "A straight stroke from one point to another.",
        example: "width 4\nrepeat 24 as i\n  line -200, i * 16 - 184, 200, 184 - i * 16, hue(i * 12)"
      },
      {
        name: "path",
        group: "shapes",
        numbers: [],
        optional: ["color"],
        usage: "path points [, color]",
        summary: "A stroke through a list of points.",
        example: "pts = []\nrepeat 80 as i\n  pts = pts + [(i * 6 - 240, sin(i / 6) * 80)]\nwidth 5\npath pts, ember"
      },
      {
        name: "shape",
        group: "shapes",
        numbers: [],
        optional: ["color"],
        usage: "shape points [, color]",
        summary: "A filled shape whose corners are a list of points.",
        example: "shape [(0, 160), (-150, -110), (150, -110)], ochre"
      },
      {
        name: "write",
        group: "shapes",
        numbers: [],
        optional: ["size", "color"],
        usage: "write text, x, y [, size] [, color]",
        summary: "Text centered on x, y. size is the letter height in pixels (18 if you leave it out).",
        example: 'paper ink\nwrite "hello", 0, 20, 64, bone\nwrite "from squiggle", 0, -40, 22, ember'
      },
      {
        name: "paper",
        group: "style",
        numbers: [],
        usage: "paper color",
        summary: "Covers the whole sheet with a color. Use it first to set the background.",
        example: "paper night\ndot 0, 0, 60, ochre"
      },
      {
        name: "color",
        group: "style",
        numbers: [],
        usage: "color c",
        summary: "Sets the color for every shape after it.",
        example: "color sea\ndot -80, 0, 50\ncolor ember\ndot 80, 0, 50"
      },
      {
        name: "width",
        group: "style",
        numbers: ["w"],
        usage: "width w",
        summary: "Sets the stroke thickness for ring, line and path.",
        example: "repeat 5 as i\n  width i * 4 + 1\n  line -180, i * 70 - 140, 180, i * 70 - 140"
      },
      {
        name: "move",
        group: "transforms",
        numbers: ["x", "y"],
        usage: "move x, y",
        summary: "Shifts everything drawn after it.",
        example: "move 100, 60\ndot 0, 0, 40, ember"
      },
      {
        name: "spin",
        group: "transforms",
        numbers: ["angle"],
        usage: "spin angle",
        summary: "Turns everything drawn after it around the current origin. Angles are in radians: a full turn is turn.",
        example: "repeat 12\n  spin turn / 12\n  box 120, 0, 60, 10, ink"
      },
      {
        name: "grow",
        group: "transforms",
        numbers: ["s"],
        optional: ["sy"],
        usage: "grow s [, sy]",
        summary: "Scales everything drawn after it. Give two values to stretch.",
        example: "grow 2, 1\nring 0, 0, 60"
      },
      {
        name: "seed",
        group: "other",
        numbers: ["n"],
        usage: "seed n",
        summary: "Starts rand over from a new seed. Every piece starts at seed 1, so the same code always gives the same art.",
        example: "seed 7\nrepeat 40\n  dot rand(-220, 220), rand(-220, 220), rand(4, 16), ember"
      },
      {
        name: "say",
        group: "other",
        numbers: [],
        usage: "say value",
        summary: "Prints a value to the console under the editor (and in the shell).",
        example: "say 6 * 7\ndot 0, 0, 42"
      }
    ];
    FUNCTIONS = [
      { name: "sin", group: "math", arity: [1, 1], usage: "sin(a)", summary: "Sine of an angle in radians, between -1 and 1.", example: "repeat 64 as i\n  dot i * 7 - 220, sin(i / 5) * 120, 5, ink" },
      { name: "cos", group: "math", arity: [1, 1], usage: "cos(a)", summary: "Cosine of an angle in radians, between -1 and 1.", example: "repeat 64 as i\n  dot i * 7 - 220, cos(i / 5) * 120, 5, sea" },
      { name: "tan", group: "math", arity: [1, 1], usage: "tan(a)", summary: "Tangent of an angle in radians.", example: "repeat 60 as i\n  dot i * 7 - 210, clamp(tan(i / 12) * 40, -200, 200), 4, ember" },
      { name: "atan", group: "math", arity: [2, 2], usage: "atan(y, x)", summary: "The angle pointing from the center to (x, y).", example: "a = atan(120, 160)\nwidth 4\nline 0, 0, cos(a) * 200, sin(a) * 200, ember\ndot 160, 120, 10" },
      { name: "sqrt", group: "math", arity: [1, 1], usage: "sqrt(x)", summary: "Square root.", example: "repeat 40 as i\n  dot i * 11 - 210, sqrt(i) * 40 - 120, 6, moss" },
      { name: "abs", group: "math", arity: [1, 1], usage: "abs(x)", summary: "Drops the minus sign.", example: "repeat 41 as i\n  dot i * 10 - 200, abs(i - 20) * 9 - 90, 6, plum" },
      { name: "floor", group: "math", arity: [1, 1], usage: "floor(x)", summary: "Rounds down to a whole number.", example: "repeat 50 as i\n  dot i * 9 - 220, floor(i / 10) * 50 - 100, 5, ink" },
      { name: "ceil", group: "math", arity: [1, 1], usage: "ceil(x)", summary: "Rounds up to a whole number.", example: "repeat 50 as i\n  dot i * 9 - 220, ceil(i / 10) * 50 - 125, 5, rust" },
      { name: "round", group: "math", arity: [1, 1], usage: "round(x)", summary: "Rounds to the nearest whole number.", example: "repeat 50 as i\n  dot i * 9 - 220, round(sin(i / 8) * 3) * 40, 5, sea" },
      { name: "min", group: "math", arity: [1, 99], usage: "min(a, b, \u2026)", summary: "The smallest value.", example: "repeat 50 as i\n  dot i * 9 - 220, min(sin(i / 6) * 150, 60), 5, ember" },
      { name: "max", group: "math", arity: [1, 99], usage: "max(a, b, \u2026)", summary: "The largest value.", example: "repeat 50 as i\n  dot i * 9 - 220, max(sin(i / 6) * 150, -60), 5, moss" },
      { name: "sign", group: "math", arity: [1, 1], usage: "sign(x)", summary: "-1, 0 or 1, following the sign of x.", example: "repeat 50 as i\n  dot i * 9 - 220, sign(sin(i / 5)) * 80, 5, ink" },
      { name: "lerp", group: "math", arity: [3, 3], usage: "lerp(a, b, k)", summary: "The value k of the way from a to b (k from 0 to 1). Works on numbers, points and colors.", example: "repeat 11 as i\n  dot lerp(-200, 200, i / 10), 0, 14, lerp(sky, ember, i / 10)" },
      { name: "clamp", group: "math", arity: [1, 3], usage: "clamp(x, low, high)", summary: "Keeps x between low and high (0 and 1 if you leave them out).", example: "repeat 50 as i\n  dot i * 9 - 220, clamp(sin(i / 6) * 200, -80, 80), 5, ochre" },
      { name: "ease", group: "math", arity: [1, 1], usage: "ease(k)", summary: "Smooths k from 0 to 1 so motion starts and stops gently.", example: "every frame\n  k = ease(t % 2 / 2)\n  dot lerp(-180, 180, k), 0, 30, ember" },
      { name: "noise", group: "math", arity: [1, 3], usage: "noise(x, y, z)", summary: "Smooth randomness between -1 and 1 that drifts as x, y, z change.", example: "every frame\n  repeat 80 as i\n    dot i * 6 - 237, noise(i / 12, t / 2) * 160, 4, sea" },
      { name: "rand", group: "math", arity: [0, 2], usage: "rand, rand(n), rand(a, b)", summary: "A seeded random number: from 0 to 1, from 0 to n, or from a to b.", example: "repeat 120\n  dot rand(-240, 240), rand(-240, 240), rand(2, 9), pick([ember, sea, ochre])" },
      { name: "hue", group: "color", arity: [1, 3], usage: "hue(h [, s, l])", summary: "A color from a hue angle in degrees (0 red, 120 green, 240 blue). s and l go from 0 to 1.", example: "repeat 36 as i\n  dot cos(i / 36 * turn) * 170, sin(i / 36 * turn) * 170, 16, hue(i * 10)" },
      { name: "mix", group: "color", arity: [3, 3], usage: "mix(a, b, k)", summary: "Blends two colors, k of the way from a to b.", example: "repeat 12 as i\n  box i * 36 - 198, 0, 36, 300, mix(night, ember, i / 11)" },
      { name: "fade", group: "color", arity: [2, 2], usage: "fade(c, k)", summary: "The same color made see-through: k = 1 is solid, 0 is invisible.", example: "repeat 6 as i\n  dot i * 50 - 125, 0, 90, fade(sea, 0.25)" },
      { name: "rgb", group: "color", arity: [3, 4], usage: "rgb(r, g, b [, a])", summary: "A color from red, green and blue between 0 and 255 (a from 0 to 1).", example: "box 0, 0, 300, 300, rgb(40, 90, 160)" },
      { name: "polar", group: "points", arity: [2, 2], usage: "polar(r, a)", summary: "The point at distance r from the center, at angle a.", example: "repeat 24 as i\n  dot polar(180, i / 24 * turn), 10, ember" },
      { name: "dist", group: "points", arity: [2, 2], usage: "dist(p, q)", summary: "The distance between two points.", example: "repeat 15 as i\n  repeat 15 as j\n    p = (i * 30 - 210, j * 30 - 210)\n    dot p, dist(p, (0, 0)) / 30, ink" },
      { name: "len", group: "lists", arity: [1, 1], usage: "len(list)", summary: "How many items a list (or text) has.", example: "cs = [ember, ochre, moss, sea, plum]\nrepeat len(cs) as i\n  dot i * 80 - 160, 0, 30, cs[i]" },
      { name: "range", group: "lists", arity: [1, 1], usage: "range(n)", summary: "The list [0, 1, \u2026 n - 1].", example: "for k in range(8)\n  ring 0, 0, k * 26 + 10" },
      { name: "pick", group: "lists", arity: [1, 1], usage: "pick(list)", summary: "A seeded random item from a list.", example: "repeat 60\n  box rand(-220, 220), rand(-220, 220), 20, 20, pick([ink, ember, bone])" }
    ];
    CONSTANTS = [
      { name: "t", group: "values", usage: "t", summary: "Seconds since the piece started. 0 outside every frame.", example: "every frame\n  dot 0, 0, 40 + sin(t * 3) * 30, ember" },
      { name: "turn", group: "values", usage: "turn", summary: "A full turn in radians (about 6.283). Half a turn is turn / 2.", example: "repeat 8 as i\n  dot polar(150, i * turn / 8), 20, ink" },
      { name: "pi", group: "values", usage: "pi", summary: "Half a turn, about 3.1416.", example: "width 6\npath [polar(150, 0), polar(150, pi / 2), polar(150, pi)], sea" },
      { name: "mouse", group: "values", usage: "mouse", summary: "Where the pointer is, as a point (0, 0 until it moves over the canvas).", example: "every frame\n  line 0, 0, mouse.x, mouse.y, ember\n  dot mouse, 12" }
    ];
    PALETTE = {
      ink: "#15130f",
      paper: "#f3eee4",
      bone: "#e6dcc8",
      chalk: "#fbf9f4",
      coal: "#2b2824",
      ash: "#8a8478",
      ember: "#e4572e",
      rust: "#a8432a",
      clay: "#c97b5a",
      ochre: "#e0a43a",
      sand: "#d8c39a",
      moss: "#6f8a4c",
      leaf: "#9cbf5c",
      sea: "#2f6f73",
      sky: "#86b3d1",
      night: "#1d2433",
      plum: "#6e4a6b",
      rose: "#e7a3a0",
      lilac: "#b7a6d6"
    };
    COMMAND_NAMES = new Set(COMMANDS.map((c) => c.name));
    FUNCTION_NAMES = new Set(FUNCTIONS.map((f) => f.name));
    CONSTANT_NAMES = new Set(CONSTANTS.map((c) => c.name));
    KEYWORD_NAMES = new Set(KEYWORDS);
    RESERVED = /* @__PURE__ */ new Set([
      ...KEYWORD_NAMES,
      ...COMMAND_NAMES,
      ...FUNCTION_NAMES,
      ...CONSTANT_NAMES,
      ...Object.keys(PALETTE)
    ]);
    SYNONYMS = {
      circle: "dot (filled) or ring (outline)",
      ellipse: "dot, after grow to stretch it",
      rect: "box",
      rectangle: "box",
      square: "box",
      text: "write",
      print: "say",
      log: "say",
      echo: "say",
      background: "paper",
      bg: "paper",
      clear: "paper",
      fill: "color",
      stroke: "color",
      strokeweight: "width",
      thickness: "width",
      weight: "width",
      rotate: "spin",
      turnby: "spin",
      translate: "move",
      scale: "grow",
      push: "keep",
      pop: "keep",
      save: "keep",
      restore: "keep",
      loop: "repeat",
      times: "repeat",
      while: "repeat",
      def: "make",
      fn: "make",
      func: "make",
      function: "make",
      to: "make",
      polygon: "shape",
      poly: "shape",
      curve: "path",
      polyline: "path",
      point: "dot",
      pixel: "dot",
      random: "rand",
      rnd: "rand",
      perlin: "noise",
      map: "lerp",
      length: "len",
      elif: "else if",
      then: "nothing (end the line and indent the next one)",
      end: "nothing (blocks end when the indent ends)",
      draw: "every frame",
      loopframe: "every frame",
      animate: "every frame",
      time: "t",
      tau: "turn",
      twopi: "turn"
    };
    KEY_NAMES = /* @__PURE__ */ new Set([
      "space",
      "enter",
      "left",
      "right",
      "up",
      "down",
      "tab",
      "backspace",
      "escape",
      ..."abcdefghijklmnopqrstuvwxyz0123456789".split("")
    ]);
    LIMITS = {
      /** evaluation steps per frame (and per handler run) */
      frameSteps: 25e4,
      /** evaluation steps for the lines outside every frame */
      setupSteps: 1e6,
      /** shapes per frame */
      maxOps: 2e4,
      /** items in one list */
      maxList: 1e4,
      /** characters in one piece of text */
      maxText: 2e3,
      /** how deep make can call itself */
      maxDepth: 64,
      /** points in one path or shape */
      maxPoints: 5e3
    };
    SIZE = 512;
    POST_LIMIT = 280;
  }
});

// ../core/src/parser.ts
function posOf(tok, len) {
  return { line: tok.line, col: tok.col, len: len ?? Math.max(1, tok.text.length) };
}
function span(a, b) {
  if (a.line !== b.line) return a;
  return { line: a.line, col: a.col, len: Math.max(1, b.col + b.len - a.col) };
}
function unknownCommandHint(name, fns) {
  const syn = SYNONYMS[name.toLowerCase()];
  if (syn) return `Squiggle calls that ${syn}`;
  const guess = closest(name, [...COMMAND_NAMES, ...fns, "repeat", "every", "keep", "make"]);
  if (guess) return `did you mean ${guess}?`;
  return "shapes are dot, ring, box, line, path, shape and write; make your own with make";
}
function parse(source, knownFns) {
  const { tokens, comments } = lex(source);
  const fns = new Set(knownFns ?? []);
  for (let k = 0; k < tokens.length - 1; k++) {
    const prev = tokens[k - 1];
    if (tokens[k].type === "name" && tokens[k].text === "make" && (!prev || prev.type === "newline" || prev.type === "indent" || prev.type === "dedent")) {
      const n = tokens[k + 1];
      if (n.type === "name") fns.add(n.text);
    }
  }
  const p = new Parser(tokens, fns);
  const body = p.program();
  return { body, tokens, comments };
}
var EXPR_START_OPS, Parser;
var init_parser = __esm({
  "../core/src/parser.ts"() {
    "use strict";
    init_errors();
    init_lexer();
    init_vocab();
    EXPR_START_OPS = /* @__PURE__ */ new Set(["(", "[", "-"]);
    Parser = class {
      i = 0;
      depth = 0;
      // nesting of blocks
      inMake = false;
      inWhen = false;
      inEvery = false;
      toks;
      fns;
      constructor(toks, fns) {
        this.toks = toks;
        this.fns = fns;
      }
      /** the current token (a method, not a getter, so TypeScript doesn't narrow it across next()) */
      cur() {
        return this.toks[this.i];
      }
      peek(n = 1) {
        return this.toks[Math.min(this.i + n, this.toks.length - 1)];
      }
      next() {
        return this.toks[this.i++];
      }
      isOp(text, tok = this.cur()) {
        return tok.type === "op" && tok.text === text;
      }
      isWord(text, tok = this.cur()) {
        return tok.type === "name" && tok.text === text;
      }
      fail(tok, message, hint, len) {
        if (tok.type === "newline" || tok.type === "eof") {
          throw new SquiggleError("syntax", message, { line: tok.line, col: Math.max(1, tok.col), len: 1 }, hint);
        }
        throw new SquiggleError("syntax", message, posOf(tok, len), hint);
      }
      describe(tok) {
        switch (tok.type) {
          case "newline":
            return "the end of the line";
          case "eof":
            return "the end of the piece";
          case "indent":
            return "an indent";
          case "dedent":
            return "the end of a block";
          case "str":
            return "text";
          case "num":
            return `the number ${tok.text}`;
          case "color":
            return `the color ${tok.text}`;
          default:
            return `"${tok.text}"`;
        }
      }
      expectOp(text, hint) {
        if (!this.isOp(text)) this.fail(this.cur(), `expected "${text}" but found ${this.describe(this.cur())}`, hint);
        return this.next();
      }
      endOfLine(what) {
        const tok = this.cur();
        if (tok.type === "newline") {
          this.next();
          return;
        }
        if (tok.type === "eof" || tok.type === "dedent") return;
        if (this.isOp("=")) this.fail(tok, "a single = stores a value; it only goes right after a name at the start of a line", "use == to check whether two things are equal");
        this.fail(tok, `didn't expect ${this.describe(tok)} after ${what}`, "each command goes on its own line; separate values with commas");
      }
      program() {
        const out = [];
        while (this.cur().type !== "eof") {
          if (this.cur().type === "newline") {
            this.next();
            continue;
          }
          out.push(this.statement());
        }
        return out;
      }
      block(header, what) {
        if (this.cur().type !== "newline") {
          if (this.cur().type === "eof") {
            this.fail(header, `${what} needs lines under it`, `put the lines it should run on the next lines, indented by two spaces`);
          }
          this.fail(this.cur(), `didn't expect ${this.describe(this.cur())} after ${what}`, `end the line after ${what} and indent the lines it runs`);
        }
        this.next();
        if (this.cur().type !== "indent") {
          this.fail(header, `${what} needs lines under it, indented`, `indent the lines that belong to ${what} by two spaces`, header.text.length);
        }
        this.next();
        this.depth++;
        const body = [];
        while (this.cur().type !== "dedent" && this.cur().type !== "eof") {
          if (this.cur().type === "newline") {
            this.next();
            continue;
          }
          body.push(this.statement());
        }
        if (this.cur().type === "dedent") this.next();
        this.depth--;
        return body;
      }
      statement() {
        const tok = this.cur();
        if (tok.type === "indent") {
          this.fail(tok, "this line is indented, but the line above doesn't start a block", "remove the indent, or start a block above it with repeat, if, keep, every frame\u2026", 2);
        }
        if (tok.type === "name") {
          switch (tok.text) {
            case "every":
              return this.every();
            case "repeat":
              return this.repeat();
            case "for":
              return this.forStmt();
            case "if":
              return this.ifStmt();
            case "else":
              this.fail(tok, "this else has no if right above it", "put else at the same indent as its if, right after the if block");
            // falls through (fail never returns)
            case "when":
              return this.when();
            case "make":
              return this.make();
            case "keep":
              return this.keep();
            case "frame":
              this.fail(tok, "frame on its own does nothing", "write every frame to start an animation block");
          }
          const after = this.peek();
          if (after.type === "op" && ["=", "+=", "-=", "*=", "/="].includes(after.text)) return this.assign();
          if (COMMAND_NAMES.has(tok.text)) return this.command();
          if (this.fns.has(tok.text) && this.looksLikeCommandCall()) return this.callStmt();
          if (FUNCTION_NAMES.has(tok.text) && this.startsArgs(after) && !this.isOp("(", after)) {
            this.fail(tok, `${tok.text} gives back a value, so it goes inside a line, not at the start`, `use it like dot ${tok.text}(\u2026), 0, 10`);
          }
          if (!KEYWORD_NAMES.has(tok.text) && this.startsArgs(after) && !FUNCTION_NAMES.has(tok.text) && !CONSTANT_NAMES.has(tok.text)) {
            this.fail(tok, `I don't know a command called "${tok.text}"`, unknownCommandHint(tok.text, this.fns));
          }
        }
        const expr = this.expr();
        const stmt = { t: "expr", expr, pos: expr.pos };
        this.endOfLine("this value");
        return stmt;
      }
      /** after a statement-leading name, does this token start an argument list? */
      startsArgs(tok) {
        if (tok.type === "num" || tok.type === "str" || tok.type === "color") return true;
        if (tok.type === "name") return !["and", "or", "as", "in"].includes(tok.text);
        if (tok.type === "op" && tok.text === "[" && tok.space) return true;
        if (tok.type === "op" && tok.text === "(" && tok.space) return true;
        if (tok.type === "op" && tok.text === "-" && tok.space && !this.peek(2).space) return true;
        return false;
      }
      looksLikeCommandCall() {
        const after = this.peek();
        if (after.type === "newline" || after.type === "eof" || after.type === "dedent") return true;
        if (this.isOp("(", after) && !after.space) return this.parenIsWholeLine(this.i + 1);
        return this.startsArgs(after);
      }
      /** true when the ( at index k closes right at the end of the line */
      parenIsWholeLine(k) {
        let depth = 0;
        for (let j = k; j < this.toks.length; j++) {
          const t = this.toks[j];
          if (t.type === "op" && (t.text === "(" || t.text === "[")) depth++;
          if (t.type === "op" && (t.text === ")" || t.text === "]")) {
            depth--;
            if (depth === 0) {
              const n = this.toks[j + 1];
              return n.type === "newline" || n.type === "eof";
            }
          }
          if (t.type === "newline" || t.type === "eof") return false;
        }
        return false;
      }
      args() {
        const nameTok = this.toks[this.i - 1];
        if (this.isOp("(") && !this.cur().space && this.parenIsWholeLine(this.i)) {
          this.next();
          const out2 = [];
          if (!this.isOp(")")) {
            out2.push(this.expr());
            while (this.isOp(",")) {
              this.next();
              out2.push(this.expr());
            }
          }
          this.expectOp(")");
          return out2;
        }
        const out = [];
        if (this.cur().type === "newline" || this.cur().type === "eof" || this.cur().type === "dedent") return out;
        out.push(this.expr());
        while (this.isOp(",")) {
          this.next();
          if (this.cur().type === "newline" || this.cur().type === "eof") {
            this.fail(this.cur(), `there's a comma after the last value of ${nameTok.text}`, "remove the trailing comma, or add the missing value");
          }
          out.push(this.expr());
        }
        return out;
      }
      command() {
        const nameTok = this.next();
        const args = this.args();
        const pos = posOf(nameTok);
        this.endOfLine(nameTok.text);
        return { t: "cmd", name: nameTok.text, args, pos };
      }
      callStmt() {
        const nameTok = this.next();
        const args = this.args();
        const pos = posOf(nameTok);
        this.endOfLine(nameTok.text);
        return { t: "callstmt", name: nameTok.text, args, pos };
      }
      checkName(tok, role) {
        if (tok.type !== "name") this.fail(tok, `${role} needs a name here, but found ${this.describe(tok)}`, "names start with a letter, like a, size or petal");
        const name = tok.text;
        if (name === "t") this.fail(tok, "t is the clock, so it can't be used as a name", "pick another name, like k or time2");
        if (KEYWORD_NAMES.has(name)) this.fail(tok, `${name} is a Squiggle word, so it can't be used as a name`, "pick another name");
        if (COMMAND_NAMES.has(name)) this.fail(tok, `${name} is already a command`, `pick another name, like my${name}`);
        if (FUNCTION_NAMES.has(name) || CONSTANT_NAMES.has(name)) this.fail(tok, `${name} is built in, so it can't be used as a name`, `pick another name, like my${name}`);
        if (name in PALETTE) this.fail(tok, `${name} is a palette color, so it can't be used as a name`, `pick another name, like my${name}`);
        return name;
      }
      assign() {
        const nameTok = this.next();
        const name = this.checkName(nameTok, "storing a value");
        if (this.fns.has(name)) this.fail(nameTok, `${name} is a command you made, so it can't also hold a value`, "pick another name for the value");
        const opTok = this.next();
        if (this.cur().type === "newline" || this.cur().type === "eof") {
          this.fail(this.cur(), `${name} ${opTok.text} needs a value after it`, `for example: ${name} ${opTok.text} 10`);
        }
        const value = this.expr();
        const pos = posOf(nameTok);
        this.endOfLine(`the value of ${name}`);
        return { t: "assign", name, op: opTok.text, value, pos };
      }
      every() {
        const kw = this.next();
        if (!this.isWord("frame")) this.fail(this.cur(), "every is always followed by frame", "write every frame");
        const frameTok = this.next();
        if (this.depth > 0) this.fail(kw, "every frame goes at the top level, not inside another block", "move it all the way to the left", 11);
        this.inEvery = true;
        const body = this.block(frameTok, "every frame");
        this.inEvery = false;
        return { t: "every", body, pos: span(posOf(kw), posOf(frameTok)) };
      }
      repeat() {
        const kw = this.next();
        if (this.cur().type === "newline" || this.cur().type === "eof") this.fail(kw, "repeat needs to know how many times", "for example: repeat 12 as i", 6);
        const count = this.expr();
        let as;
        if (this.isWord("as")) {
          this.next();
          as = this.checkName(this.next(), "as");
        }
        const body = this.block(kw, "repeat");
        return { t: "repeat", count, as, body, pos: posOf(kw) };
      }
      forStmt() {
        const kw = this.next();
        const as = this.checkName(this.next(), "for");
        if (!this.isWord("in")) this.fail(this.cur(), 'for needs "in" and a list', `for example: for ${as} in [1, 2, 3]`);
        this.next();
        const list = this.expr();
        const body = this.block(kw, "for");
        return { t: "for", as, list, body, pos: posOf(kw) };
      }
      ifStmt() {
        const kw = this.next();
        if (this.cur().type === "newline" || this.cur().type === "eof") this.fail(kw, "if needs a test", "for example: if i % 2 == 0", 2);
        const cond = this.expr();
        if (this.isOp("=")) this.fail(this.cur(), "a single = stores a value", "use == to check whether two things are equal");
        const body = this.block(kw, "if");
        let elseBody;
        if (this.isWord("else")) {
          const elseTok = this.next();
          if (this.isWord("if")) {
            elseBody = [this.ifStmt()];
          } else {
            elseBody = this.block(elseTok, "else");
          }
        }
        return { t: "if", cond, body, else: elseBody, pos: posOf(kw) };
      }
      when() {
        const kw = this.next();
        if (this.depth > 0) this.fail(kw, "when goes at the top level, not inside another block", "move it all the way to the left", 4);
        let on;
        let key;
        if (this.isWord("click")) {
          on = "click";
          this.next();
        } else if (this.isWord("key")) {
          on = "key";
          this.next();
          const k = this.cur();
          if (k.type !== "str") this.fail(k, "when key needs the key in quotes", 'for example: when key "space"');
          this.next();
          key = String(k.value).toLowerCase();
          const aliases = { " ": "space", return: "enter", esc: "escape", arrowleft: "left", arrowright: "right", arrowup: "up", arrowdown: "down" };
          key = aliases[key] ?? key;
          if (!KEY_NAMES.has(key)) {
            const guess = closest(key, KEY_NAMES);
            this.fail(k, `I don't know the key "${k.value}"`, guess ? `try "${guess}"` : 'keys are "space", "enter", "left", "right", "up", "down", letters and digits');
          }
        } else {
          this.fail(this.cur(), "when is followed by key or click", 'for example: when key "space" or when click');
        }
        this.inWhen = true;
        const body = this.block(kw, `when ${on}`);
        this.inWhen = false;
        return { t: "when", on, key, body, pos: posOf(kw) };
      }
      make() {
        const kw = this.next();
        if (this.depth > 0 || this.inMake) this.fail(kw, "make goes at the top level, not inside another block", "move it all the way to the left", 4);
        const nameTok = this.next();
        const name = this.checkName(nameTok, "make");
        const params = [];
        if (this.cur().type === "name") {
          params.push(this.checkName(this.next(), "make"));
          while (this.isOp(",")) {
            this.next();
            const pTok = this.next();
            const p = this.checkName(pTok, "make");
            if (params.includes(p)) this.fail(pTok, `${p} is listed twice`, "give each input its own name");
            params.push(p);
          }
        } else if (this.isOp("(")) {
          this.fail(this.cur(), "make lists its inputs without brackets", `for example: make ${name} a, b`);
        }
        this.inMake = true;
        const body = this.block(kw, `make ${name}`);
        this.inMake = false;
        return { t: "make", name, params, body, pos: span(posOf(kw), posOf(nameTok)) };
      }
      keep() {
        const kw = this.next();
        const body = this.block(kw, "keep");
        return { t: "keep", body, pos: posOf(kw) };
      }
      // ---- expressions ----
      expr() {
        return this.or();
      }
      or() {
        let a = this.and();
        while (this.isWord("or")) {
          this.next();
          const b = this.and();
          a = { t: "bin", op: "or", a, b, pos: span(a.pos, b.pos) };
        }
        return a;
      }
      and() {
        let a = this.not();
        while (this.isWord("and")) {
          this.next();
          const b = this.not();
          a = { t: "bin", op: "and", a, b, pos: span(a.pos, b.pos) };
        }
        return a;
      }
      not() {
        if (this.isWord("not")) {
          const tok = this.next();
          const a = this.not();
          return { t: "un", op: "not", a, pos: span(posOf(tok), a.pos) };
        }
        return this.compare();
      }
      compare() {
        const a = this.sum();
        const tok = this.cur();
        if (tok.type === "op" && ["==", "!=", "<", ">", "<=", ">="].includes(tok.text)) {
          this.next();
          const b = this.sum();
          const t2 = this.cur();
          if (t2.type === "op" && ["==", "!=", "<", ">", "<=", ">="].includes(t2.text)) {
            this.fail(t2, "compare two things at a time", "join two tests with and, like a < b and b < c");
          }
          return { t: "bin", op: tok.text, a, b, pos: span(a.pos, b.pos) };
        }
        return a;
      }
      sum() {
        let a = this.product();
        while (this.cur().type === "op" && (this.cur().text === "+" || this.cur().text === "-")) {
          const op = this.next().text;
          const b = this.product();
          a = { t: "bin", op, a, b, pos: span(a.pos, b.pos) };
        }
        return a;
      }
      product() {
        let a = this.unary();
        while (this.cur().type === "op" && (this.cur().text === "*" || this.cur().text === "/" || this.cur().text === "%")) {
          const op = this.next().text;
          const b = this.unary();
          a = { t: "bin", op, a, b, pos: span(a.pos, b.pos) };
        }
        return a;
      }
      unary() {
        if (this.isOp("-")) {
          const tok = this.next();
          tok.unary = true;
          const a = this.unary();
          if (a.t === "num") return { t: "num", v: -a.v, pos: span(posOf(tok), a.pos) };
          return { t: "un", op: "-", a, pos: span(posOf(tok), a.pos) };
        }
        return this.power();
      }
      power() {
        const a = this.postfix();
        if (this.isOp("^")) {
          this.next();
          const b = this.unary();
          return { t: "bin", op: "^", a, b, pos: span(a.pos, b.pos) };
        }
        return a;
      }
      postfix() {
        let e = this.primary();
        for (; ; ) {
          if (this.isOp("(")) {
            if (e.t !== "name" && e.t !== "member" && e.t !== "index" && e.t !== "call") break;
            this.next();
            const args = [];
            if (!this.isOp(")")) {
              args.push(this.expr());
              while (this.isOp(",")) {
                this.next();
                args.push(this.expr());
              }
            }
            const close = this.expectOp(")", "separate the values inside with commas");
            e = { t: "call", fn: e, args, pos: span(e.pos, posOf(close)) };
            continue;
          }
          if (this.isOp("[")) {
            this.next();
            const index = this.expr();
            const close = this.expectOp("]");
            e = { t: "index", obj: e, index, pos: span(e.pos, posOf(close)) };
            continue;
          }
          if (this.isOp(".")) {
            this.next();
            const nameTok = this.cur();
            if (nameTok.type !== "name") this.fail(nameTok, "a dot is followed by a name, like p.x", "points have .x and .y");
            this.next();
            e = { t: "member", obj: e, name: nameTok.text, pos: span(e.pos, posOf(nameTok)) };
            continue;
          }
          break;
        }
        return e;
      }
      primary() {
        const tok = this.cur();
        switch (tok.type) {
          case "num":
            this.next();
            return { t: "num", v: tok.value, pos: posOf(tok) };
          case "str":
            this.next();
            return { t: "str", v: tok.value, pos: posOf(tok) };
          case "color":
            this.next();
            return { t: "color", hex: tok.value, pos: posOf(tok) };
          case "name": {
            if (tok.text === "true" || tok.text === "false") {
              this.next();
              return { t: "bool", v: tok.text === "true", pos: posOf(tok) };
            }
            if (KEYWORD_NAMES.has(tok.text)) {
              this.fail(tok, `${tok.text} can't be used inside a value`, tok.text === "every" || tok.text === "repeat" || tok.text === "if" ? `${tok.text} starts its own line` : void 0);
            }
            this.next();
            return { t: "name", name: tok.text, pos: posOf(tok) };
          }
          case "op": {
            if (tok.text === "(") {
              this.next();
              const a = this.expr();
              if (this.isOp(",")) {
                this.next();
                const b = this.expr();
                if (this.isOp(",")) this.fail(this.cur(), "points have two values: (x, y)", "use a list for more values: [a, b, c]");
                const close = this.expectOp(")");
                return { t: "point", x: a, y: b, pos: span(posOf(tok), posOf(close)) };
              }
              this.expectOp(")");
              return a;
            }
            if (tok.text === "[") {
              this.next();
              const items = [];
              if (!this.isOp("]")) {
                items.push(this.expr());
                while (this.isOp(",")) {
                  this.next();
                  if (this.isOp("]")) break;
                  items.push(this.expr());
                }
              }
              const close = this.expectOp("]", "separate list items with commas");
              return { t: "list", items, pos: span(posOf(tok), posOf(close)) };
            }
            break;
          }
        }
        if (tok.type === "newline" || tok.type === "eof") this.fail(tok, "this line stops before its value", "finish the line with a value");
        if (tok.type === "indent") this.fail(tok, "this line is indented, but the line above doesn't start a block", "remove the indent");
        this.fail(tok, `didn't expect ${this.describe(tok)} here`, EXPR_START_OPS.has(tok.text) ? void 0 : 'a value is a number, "text", a color, a name, a (point) or a [list]');
      }
    };
  }
});

// ../core/src/color.ts
function rgba(r, g, b, a = 1) {
  return { kind: "color", r: clamp255(r), g: clamp255(g), b: clamp255(b), a: Math.round(clamp01(a) * 1e3) / 1e3 };
}
function fromHex(hex) {
  let h = hex.replace(/^#/, "");
  if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("");
  const n = (k) => parseInt(h.slice(k, k + 2), 16);
  return rgba(n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1);
}
function hue(h, s = 0.68, l = 0.58) {
  const hh = (h % 360 + 360) % 360 / 360;
  s = clamp01(s);
  l = clamp01(l);
  const q2 = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q2;
  const f = (tt) => {
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q2 - p) * 6 * tt;
    if (tt < 1 / 2) return q2;
    if (tt < 2 / 3) return p + (q2 - p) * (2 / 3 - tt) * 6;
    return p;
  };
  return rgba(f(hh + 1 / 3) * 255, f(hh) * 255, f(hh - 1 / 3) * 255);
}
function toOklab(c) {
  const r = toLinear(c.r), g = toLinear(c.g), b = toLinear(c.b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  ];
}
function fromOklab(L, A, B, a) {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return rgba(
    fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    a
  );
}
function mix(x, y, k) {
  k = clamp01(k);
  if (k === 0) return x;
  if (k === 1) return y;
  const a = toOklab(x);
  const b = toOklab(y);
  return fromOklab(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, x.a + (y.a - x.a) * k);
}
function fade(c, k) {
  return rgba(c.r, c.g, c.b, c.a * clamp01(k));
}
function toHex(c) {
  const base = `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`;
  return c.a >= 1 ? base : base + hex2(Math.round(c.a * 255));
}
function toCss(c) {
  return c.a >= 1 ? `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}` : `rgba(${c.r},${c.g},${c.b},${c.a})`;
}
function sameColor(a, b) {
  return a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;
}
function colorName(c) {
  for (const [k, v] of Object.entries(PALETTE_COLORS)) if (sameColor(c, v)) return k;
  return toHex(c);
}
var clamp255, clamp01, PALETTE_COLORS, toLinear, fromLinear, hex2;
var init_color = __esm({
  "../core/src/color.ts"() {
    "use strict";
    init_vocab();
    clamp255 = (v) => Math.max(0, Math.min(255, Math.round(v)));
    clamp01 = (v) => Math.max(0, Math.min(1, v));
    PALETTE_COLORS = Object.fromEntries(
      Object.entries(PALETTE).map(([k, v]) => [k, fromHex(v)])
    );
    toLinear = (c) => {
      const v = c / 255;
      return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    fromLinear = (v) => {
      const c = v <= 31308e-7 ? v * 12.92 : 1.055 * Math.pow(Math.max(0, v), 1 / 2.4) - 0.055;
      return c * 255;
    };
    hex2 = (v) => v.toString(16).padStart(2, "0");
  }
});

// ../core/src/random.ts
function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 15;
  h = Math.imul(h, 739982445);
  h ^= h >>> 12;
  return h >>> 0;
}
function grad(hash, x, y, z) {
  const h = hash & 15;
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}
function noise3(x, y, z) {
  const fx = Math.floor(x), fy = Math.floor(y), fz = Math.floor(z);
  const X = fx & 255, Y = fy & 255, Z = fz & 255;
  x -= fx;
  y -= fy;
  z -= fz;
  const u = fadeCurve(x), v = fadeCurve(y), w = fadeCurve(z);
  const A = PERM[X] + Y, AA = PERM[A] + Z, AB = PERM[A + 1] + Z;
  const B = PERM[X + 1] + Y, BA = PERM[B] + Z, BB = PERM[B + 1] + Z;
  const n = lerp(
    lerp(lerp(grad(PERM[AA], x, y, z), grad(PERM[BA], x - 1, y, z), u), lerp(grad(PERM[AB], x, y - 1, z), grad(PERM[BB], x - 1, y - 1, z), u), v),
    lerp(lerp(grad(PERM[AA + 1], x, y, z - 1), grad(PERM[BA + 1], x - 1, y, z - 1), u), lerp(grad(PERM[AB + 1], x, y - 1, z - 1), grad(PERM[BB + 1], x - 1, y - 1, z - 1), u), v),
    w
  );
  return Math.max(-1, Math.min(1, n * 1.4));
}
var Rand, PERM, fadeCurve, lerp;
var init_random = __esm({
  "../core/src/random.ts"() {
    "use strict";
    Rand = class {
      a = 0;
      b = 0;
      c = 0;
      d = 0;
      constructor(seed = 1) {
        this.reseed(seed);
      }
      reseed(seed) {
        let h = hashString(String(seed));
        const next = () => {
          h = Math.imul(h ^ h >>> 16, 73244475);
          h = Math.imul(h ^ h >>> 13, 73244475);
          h ^= h >>> 16;
          return h >>> 0;
        };
        this.a = next();
        this.b = next();
        this.c = next();
        this.d = 1;
        for (let i = 0; i < 12; i++) this.next();
      }
      /** a float in [0, 1) */
      next() {
        const t = (this.a + this.b | 0) + this.d | 0;
        this.d = this.d + 1 | 0;
        this.a = this.b ^ this.b >>> 9;
        this.b = this.c + (this.c << 3) | 0;
        this.c = this.c << 21 | this.c >>> 11;
        this.c = this.c + t | 0;
        return (t >>> 0) / 4294967296;
      }
    };
    PERM = new Uint8Array(512);
    {
      const r = new Rand(20261027);
      const p = Array.from({ length: 256 }, (_, i) => i);
      for (let i = 255; i > 0; i--) {
        const j = Math.floor(r.next() * (i + 1));
        [p[i], p[j]] = [p[j], p[i]];
      }
      for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
    }
    fadeCurve = (t) => t * t * t * (t * (t * 6 - 15) + 10);
    lerp = (a, b, t) => a + (b - a) * t;
  }
});

// ../core/src/ops.ts
function snapMat(m) {
  return [qm(m[0]), qm(m[1]), qm(m[2]), qm(m[3]), q(m[4]), q(m[5])];
}
function isIdentity(m) {
  return m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1 && m[4] === 0 && m[5] === 0;
}
function mul(m, n) {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5]
  ];
}
function opKey(op) {
  switch (op.k) {
    case "paper":
      return `P${op.c}`;
    case "dot":
      return `D${op.m.join(",")}|${op.x},${op.y},${op.r}|${op.c}`;
    case "ring":
      return `R${op.m.join(",")}|${op.x},${op.y},${op.r},${op.w}|${op.c}`;
    case "box":
      return `B${op.m.join(",")}|${op.x},${op.y},${op.w},${op.h}|${op.c}`;
    case "line":
      return `L${op.m.join(",")}|${op.x1},${op.y1},${op.x2},${op.y2},${op.w}|${op.c}`;
    case "path":
      return `H${op.m.join(",")}|${op.p.join(",")},${op.w}|${op.c}`;
    case "shape":
      return `S${op.m.join(",")}|${op.p.join(",")}|${op.c}`;
    case "text":
      return `T${op.m.join(",")}|${JSON.stringify(op.s)},${op.x},${op.y},${op.size}|${op.c}`;
  }
}
function hashOps(ops) {
  let h1 = 3735928559 ^ ops.length;
  let h2 = 1103547991 ^ ops.length;
  for (const op of ops) {
    const s = opKey(op) + "\n";
    for (let i = 0; i < s.length; i++) {
      const ch = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
  }
  h1 = Math.imul(h1 ^ h1 >>> 16, 2246822507) ^ Math.imul(h2 ^ h2 >>> 13, 3266489909);
  h2 = Math.imul(h2 ^ h2 >>> 16, 2246822507) ^ Math.imul(h1 ^ h1 >>> 13, 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0");
}
var IDENTITY, q, qm;
var init_ops = __esm({
  "../core/src/ops.ts"() {
    "use strict";
    IDENTITY = [1, 0, 0, 1, 0, 0];
    q = (v) => {
      const r = Math.round(v * 256) / 256;
      return r === 0 ? 0 : r;
    };
    qm = (v) => {
      const r = Math.round(v * 65536) / 65536;
      return r === 0 ? 0 : r;
    };
  }
});

// ../core/src/interpreter.ts
function typeName(v) {
  if (v === null) return "nothing";
  if (typeof v === "number") return "a number";
  if (typeof v === "string") return "text";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (Array.isArray(v)) return "a list";
  switch (v.kind) {
    case "point":
      return "a point";
    case "color":
      return "a color";
    default:
      return `the command ${v.name}`;
  }
}
function fmtNum(n) {
  if (!Number.isFinite(n)) return Number.isNaN(n) ? "not-a-number" : n > 0 ? "infinity" : "-infinity";
  const r = Math.round(n * 1e4) / 1e4;
  return String(r === 0 ? 0 : r);
}
function show(v, nested = false) {
  if (v === null) return "none";
  if (typeof v === "number") return fmtNum(v);
  if (typeof v === "string") return nested ? JSON.stringify(v) : v;
  if (typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return `[${v.map((x) => show(x, true)).join(", ")}]`;
  switch (v.kind) {
    case "point":
      return `(${fmtNum(v.x)}, ${fmtNum(v.y)})`;
    case "color":
      return colorName(v);
    case "fn":
      return `make ${v.name}`;
    default:
      return v.name;
  }
}
function equal(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => equal(x, b[i]));
  if (isPoint(a) && isPoint(b)) return a.x === b.x && a.y === b.y;
  if (isColor(a) && isColor(b)) return sameColor(a, b);
  return false;
}
function truthy(v) {
  if (v === null || v === false || v === 0 || v === "") return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "number" && Number.isNaN(v)) return false;
  return true;
}
function checkArity(name, args, at) {
  const spec = FN_SPECS[name];
  const [lo, hi] = spec.arity;
  if (args.length < lo || args.length > hi) {
    const want = lo === hi ? `${lo}` : hi >= 99 ? `at least ${lo}` : `${lo} to ${hi}`;
    throw rt(`${name} takes ${want} value${hi === 1 ? "" : "s"} (got ${args.length})`, at, spec.usage);
  }
}
function num(name, v, at, what = "a number") {
  if (typeof v !== "number") throw rt(`${name} needs ${what}, but got ${typeName(v)}`, at, FN_SPECS[name]?.usage);
  return v;
}
function col(name, v, at) {
  if (!isColor(v)) throw rt(`${name} needs a color, but got ${typeName(v)}`, at, FN_SPECS[name]?.usage);
  return v;
}
function math1(name, f) {
  return {
    kind: "native",
    name,
    call: (args, at) => {
      checkArity(name, args, at);
      return f(num(name, args[0], at));
    }
  };
}
var MAX_SOURCE, DEFAULT_PAPER, isPoint, isColor, isFn, pt, Scope, Budget, rt, Interp, COMMAND_SPECS, FN_SPECS, native, NATIVES, Shell;
var init_interpreter = __esm({
  "../core/src/interpreter.ts"() {
    "use strict";
    init_errors();
    init_parser();
    init_color();
    init_random();
    init_ops();
    init_vocab();
    MAX_SOURCE = 2e4;
    DEFAULT_PAPER = toCss(PALETTE_COLORS.paper);
    isPoint = (v) => typeof v === "object" && v !== null && !Array.isArray(v) && v.kind === "point";
    isColor = (v) => typeof v === "object" && v !== null && !Array.isArray(v) && v.kind === "color";
    isFn = (v) => typeof v === "object" && v !== null && !Array.isArray(v) && (v.kind === "fn" || v.kind === "native");
    pt = (x, y) => ({ kind: "point", x, y });
    Scope = class _Scope {
      vars = /* @__PURE__ */ new Map();
      parent;
      block;
      constructor(parent, block = false) {
        this.parent = parent;
        this.block = block;
      }
      find(name) {
        let s = this;
        while (s) {
          if (s.vars.has(name)) return s;
          s = s.parent;
        }
        return null;
      }
      /** new names skip loop scopes and land in the enclosing make or the top level */
      home() {
        let s = this;
        while (s.block && s.parent) s = s.parent;
        return s;
      }
      clone() {
        const c = new _Scope(this.parent, this.block);
        c.vars = new Map(this.vars);
        return c;
      }
    };
    Budget = class extends Error {
      at;
      constructor(at) {
        super("budget");
        this.at = at;
      }
    };
    rt = (message, at, hint) => new SquiggleError("runtime", message, at, hint);
    Interp = class {
      program;
      limits;
      animated;
      interactive;
      globals = new Scope(null);
      active;
      fns = /* @__PURE__ */ new Map();
      frameBodies = [];
      keyHandlers = /* @__PURE__ */ new Map();
      clickHandlers = [];
      setupDone = false;
      setupError = null;
      setupOps = [];
      setupLogs = [];
      setupWarnings = [];
      setupEnd = { m: IDENTITY, color: PALETTE_COLORS.ink, width: 2 };
      frameSeed = 1;
      // Per run.
      mode = "setup";
      ops = [];
      state = { m: IDENTITY, color: PALETTE_COLORS.ink, width: 2 };
      steps = 0;
      budget = 0;
      depth = 0;
      loopAt = null;
      /** scopes of the lines that called each running make, innermost last */
      callers = [];
      logs = [];
      warnings = [];
      warned = /* @__PURE__ */ new Set();
      rand = new Rand(1);
      time = 0;
      mouse = pt(0, 0);
      constructor(source, limits = {}, knownFns) {
        this.limits = { ...LIMITS, ...limits };
        if (source.length > MAX_SOURCE) {
          throw new SquiggleError("syntax", `this piece is ${source.length.toLocaleString("en-US")} characters; the most Squiggle runs is ${MAX_SOURCE.toLocaleString("en-US")}`, { line: 1, col: 1 }, "squeeze it down: a post fits 280");
        }
        this.program = parse(source, knownFns);
        this.active = this.globals;
        for (const st of this.program.body) {
          if (st.t === "make") this.fns.set(st.name, { kind: "fn", name: st.name, params: st.params, body: st.body });
          if (st.t === "every") this.frameBodies.push(st.body);
          if (st.t === "when" && st.on === "click") this.clickHandlers.push(st.body);
          if (st.t === "when" && st.on === "key") {
            const list = this.keyHandlers.get(st.key) ?? [];
            list.push(st.body);
            this.keyHandlers.set(st.key, list);
          }
        }
        this.animated = this.frameBodies.length > 0;
        this.interactive = this.clickHandlers.length > 0 || this.keyHandlers.size > 0;
      }
      get keys() {
        return [...this.keyHandlers.keys()];
      }
      // ---- running ----
      begin(mode, budget, state) {
        this.mode = mode;
        this.budget = budget;
        this.steps = 0;
        this.depth = 0;
        this.loopAt = null;
        this.ops = [];
        this.state = { ...state };
        this.logs = [];
        this.warnings = [];
        this.warned.clear();
      }
      runGuarded(body, what) {
        try {
          this.execBlock(body);
        } catch (e) {
          if (e instanceof Budget) {
            throw new SquiggleError(
              "budget",
              `${what} took more than ${this.budget.toLocaleString("en-US")} steps, so it was stopped`,
              e.at ?? { line: 1, col: 1, len: 1 },
              e.at ? "this loop runs too many times; try a smaller count" : "something here runs too long; try smaller numbers"
            );
          }
          if (e instanceof RangeError) {
            throw new SquiggleError("runtime", "this piece nests too deeply to run", { line: 1, col: 1 }, "make fewer calls inside calls");
          }
          throw e;
        }
      }
      ensureSetup() {
        if (this.setupDone) {
          if (this.setupError) throw this.setupError;
          return;
        }
        this.setupDone = true;
        this.begin("setup", this.limits.setupSteps, { m: IDENTITY, color: PALETTE_COLORS.ink, width: 2 });
        this.rand.reseed(1);
        this.frameSeed = 1;
        this.time = 0;
        this.active = this.globals;
        try {
          this.runGuarded(this.program.body, "the lines outside every frame");
        } catch (e) {
          this.setupError = e;
          throw e;
        }
        this.setupOps = this.ops;
        this.setupEnd = { ...this.state };
        this.setupLogs = this.logs;
        this.setupWarnings = this.warnings;
      }
      /** Draws the frame at time t (seconds). Pure: the same t always gives the same frame. */
      frame(t, mouse) {
        this.ensureSetup();
        const base = { k: "paper", c: DEFAULT_PAPER };
        if (!this.animated) {
          return { ops: [base, ...this.setupOps], steps: 0, logs: this.setupLogs, warnings: this.setupWarnings };
        }
        this.begin("frame", this.limits.frameSteps, this.setupEnd);
        this.ops = [...this.setupOps];
        this.time = Number.isFinite(t) ? t : 0;
        if (mouse) this.mouse = pt(q(mouse.x), q(mouse.y));
        this.rand.reseed(this.frameSeed);
        this.active = this.globals.clone();
        try {
          for (const body of this.frameBodies) this.runGuarded(body, "this frame");
        } finally {
          this.active = this.globals;
        }
        const logs = this.setupLogs.length ? [...this.setupLogs, ...this.logs] : this.logs;
        return { ops: [base, ...this.ops], steps: this.steps, logs, warnings: [...this.setupWarnings, ...this.warnings] };
      }
      /** Runs `when key` blocks; returns false when the piece doesn't listen for that key. */
      press(key, t) {
        const handlers = this.keyHandlers.get(key.toLowerCase());
        if (!handlers) return false;
        this.ensureSetup();
        for (const body of handlers) this.handle(body, t);
        return true;
      }
      click(x, y, t) {
        this.mouse = pt(q(x), q(y));
        if (!this.clickHandlers.length) return false;
        this.ensureSetup();
        for (const body of this.clickHandlers) this.handle(body, t);
        return true;
      }
      handle(body, t) {
        this.begin("handler", this.limits.frameSteps, this.setupEnd);
        this.time = t;
        this.rand.reseed(this.frameSeed + 0.5);
        this.active = this.globals;
        this.runGuarded(body, "this when block");
      }
      /** Runs the lines once, top to bottom, and returns the last value (the shell uses this). */
      evaluate() {
        this.begin("setup", this.limits.setupSteps, this.setupEnd);
        this.active = this.globals;
        let value = null;
        try {
          value = this.execBlock(this.program.body);
        } catch (e) {
          if (e instanceof Budget) {
            throw new SquiggleError("budget", `this took more than ${this.budget.toLocaleString("en-US")} steps, so it was stopped`, e.at ?? { line: 1, col: 1 }, "try a smaller count");
          }
          throw e;
        }
        return { value, logs: this.logs };
      }
      /** Shares the top level with earlier chunks (the shell runs one chunk at a time). */
      attach(shared) {
        for (const [k, v] of this.fns) shared.fns.set(k, v);
        this.fns = shared.fns;
        this.globals = shared.globals;
        this.active = shared.globals;
        this.rand = shared.rand;
      }
      // ---- statements ----
      tick() {
        if (++this.steps > this.budget) throw new Budget(this.loopAt);
      }
      execBlock(body) {
        let last = null;
        for (const st of body) last = this.exec(st);
        return last;
      }
      exec(st) {
        this.tick();
        switch (st.t) {
          case "expr":
            return this.eval(st.expr);
          case "assign": {
            let v = this.eval(st.value);
            const home = this.active.find(st.name);
            if (st.op !== "=") {
              if (!home) throw rt(`${st.name} has no value yet, so ${st.op} has nothing to change`, st.pos, `start with ${st.name} = 0`);
              v = this.binary(st.op[0], home.vars.get(st.name), v, st.pos);
            }
            (home ?? this.active.home()).vars.set(st.name, v);
            return null;
          }
          case "cmd":
            return this.command(st.name, st.args, st.pos);
          case "callstmt": {
            const fn = this.fns.get(st.name);
            return this.callUser(fn, st.args.map((a) => this.eval(a)), st.pos);
          }
          case "every":
          case "when":
          case "make":
            return null;
          // registered when the piece was read
          case "repeat": {
            const n = this.eval(st.count);
            if (typeof n !== "number" || !Number.isFinite(n)) {
              throw rt(`repeat needs a number of times, but got ${typeName(n)}`, st.count.pos, "for example: repeat 12 as i");
            }
            const count = Math.floor(n);
            const saved = this.loopAt;
            this.loopAt = st.pos;
            const scope = new Scope(this.active, true);
            const outer = this.active;
            this.active = scope;
            const name = st.as ?? "i";
            let last = null;
            try {
              for (let i = 0; i < count; i++) {
                scope.vars.set(name, i);
                last = this.execBlock(st.body);
              }
            } finally {
              this.active = outer;
              this.loopAt = saved;
            }
            return last;
          }
          case "for": {
            const list = this.eval(st.list);
            let items;
            if (Array.isArray(list)) items = list;
            else if (typeof list === "string") items = [...list];
            else throw rt(`for needs a list, but got ${typeName(list)}`, st.list.pos, "for example: for c in [ember, sea, moss]");
            const saved = this.loopAt;
            this.loopAt = st.pos;
            const scope = new Scope(this.active, true);
            const outer = this.active;
            this.active = scope;
            let last = null;
            try {
              for (const item of items) {
                scope.vars.set(st.as, item);
                last = this.execBlock(st.body);
              }
            } finally {
              this.active = outer;
              this.loopAt = saved;
            }
            return last;
          }
          case "if": {
            if (truthy(this.eval(st.cond))) return this.execBlock(st.body);
            if (st.else) return this.execBlock(st.else);
            return null;
          }
          case "keep": {
            const saved = { ...this.state };
            try {
              return this.execBlock(st.body);
            } finally {
              this.state = saved;
            }
          }
        }
      }
      // ---- commands ----
      warn(at, message) {
        const key = `${at.line}:${message}`;
        if (this.warned.has(key) || this.warnings.length > 50) return;
        this.warned.add(key);
        this.warnings.push({ line: at.line, col: at.col, message });
      }
      emit(op, at) {
        if (this.ops.length >= this.limits.maxOps) {
          throw rt(`this frame drew more than ${this.limits.maxOps.toLocaleString("en-US")} shapes, which is the most one frame can hold`, at, "draw fewer shapes, or bigger ones");
        }
        this.ops.push(op);
      }
      drawingAllowed(name, at) {
        if (this.mode === "handler") {
          throw rt(`${name} can't draw inside a when block`, at, "change a value here, and draw it in every frame");
        }
      }
      /** Flattens points into numbers and splits off a trailing color. */
      numbersAndColor(spec, args, at) {
        const nums = [];
        let color;
        for (let k = 0; k < args.length; k++) {
          const v = this.eval(args[k]);
          if (typeof v === "number") nums.push(v);
          else if (isPoint(v)) nums.push(v.x, v.y);
          else if (isColor(v) && k === args.length - 1 && spec.optional?.includes("color")) color = v;
          else if (isColor(v)) {
            throw rt(`${spec.name} got a color where it expected a number`, args[k].pos, spec.optional?.includes("color") ? `the color goes last: ${spec.usage}` : `set colors with color, then ${spec.usage}`);
          } else {
            const what = spec.numbers[nums.length] ?? "a number";
            throw rt(`${spec.name} got ${typeName(v)} where it expected a number (${what})`, args[k].pos, spec.usage);
          }
        }
        const want = spec.numbers.length;
        const extra = spec.optional?.filter((o) => o !== "color").length ?? 0;
        if (nums.length < want || nums.length > want + extra) {
          const list = spec.numbers.join(", ");
          const got = nums.length === 0 ? "none" : String(nums.length);
          throw rt(
            `${spec.name} needs ${want} number${want === 1 ? "" : "s"}: ${list} (got ${got})`,
            at,
            spec.usage
          );
        }
        return { nums, color };
      }
      finite(name, nums, at) {
        for (const n of nums) {
          if (!Number.isFinite(n)) {
            this.warn(at, `skipped a ${name} with a number that isn't finite (a division by zero?)`);
            return false;
          }
        }
        return true;
      }
      pointList(name, args, at) {
        const vals = args.map((a) => this.eval(a));
        let color;
        if (vals.length && isColor(vals[vals.length - 1])) color = vals.pop();
        let items = vals;
        if (vals.length === 1 && Array.isArray(vals[0])) items = vals[0];
        else if (vals.length === 1 && !isPoint(vals[0])) throw rt(`${name} needs a list of points, but got ${typeName(vals[0])}`, at, `${name} [(0, 0), (100, 50), (200, 0)]`);
        const pts = [];
        for (let k = 0; k < items.length; k++) {
          const v = items[k];
          if (isPoint(v)) pts.push(v.x, v.y);
          else if (typeof v === "number") pts.push(v);
          else throw rt(`${name} needs points, but item ${k} is ${typeName(v)}`, at, `${name} [(0, 0), (100, 50), (200, 0)]`);
        }
        if (pts.length % 2 === 1) throw rt(`${name} got an odd count of numbers, so the last point has no y`, at, `give it points like (x, y)`);
        if (pts.length / 2 > this.limits.maxPoints) {
          throw rt(`${name} got ${pts.length / 2} points; the most is ${this.limits.maxPoints.toLocaleString("en-US")}`, at, "use fewer points");
        }
        return { pts, color };
      }
      command(name, args, at) {
        const spec = COMMAND_SPECS[name];
        const st = this.state;
        switch (name) {
          case "dot":
          case "ring": {
            this.drawingAllowed(name, at);
            const { nums, color } = this.numbersAndColor(spec, args, at);
            if (!this.finite(name, nums, at)) return null;
            const r = q(nums[2]);
            if (r <= 0) return null;
            const c = toCss(color ?? st.color);
            if (name === "dot") this.emit({ k: "dot", m: snapMat(st.m), x: q(nums[0]), y: q(nums[1]), r, c }, at);
            else this.emit({ k: "ring", m: snapMat(st.m), x: q(nums[0]), y: q(nums[1]), r, c, w: q(st.width) }, at);
            return null;
          }
          case "box": {
            this.drawingAllowed(name, at);
            const { nums, color } = this.numbersAndColor(spec, args, at);
            if (!this.finite(name, nums, at)) return null;
            this.emit({ k: "box", m: snapMat(st.m), x: q(nums[0]), y: q(nums[1]), w: q(nums[2]), h: q(nums[3]), c: toCss(color ?? st.color) }, at);
            return null;
          }
          case "line": {
            this.drawingAllowed(name, at);
            const { nums, color } = this.numbersAndColor(spec, args, at);
            if (!this.finite(name, nums, at)) return null;
            this.emit({ k: "line", m: snapMat(st.m), x1: q(nums[0]), y1: q(nums[1]), x2: q(nums[2]), y2: q(nums[3]), c: toCss(color ?? st.color), w: q(st.width) }, at);
            return null;
          }
          case "path":
          case "shape": {
            this.drawingAllowed(name, at);
            if (!args.length) throw rt(`${name} needs a list of points`, at, spec.usage);
            const { pts, color } = this.pointList(name, args, at);
            if (!this.finite(name, pts, at)) return null;
            if (pts.length < 4) return null;
            const p = pts.map(q);
            const c = toCss(color ?? st.color);
            if (name === "path") this.emit({ k: "path", m: snapMat(st.m), p, c, w: q(st.width) }, at);
            else this.emit({ k: "shape", m: snapMat(st.m), p, c }, at);
            return null;
          }
          case "write": {
            this.drawingAllowed(name, at);
            if (!args.length) throw rt("write needs some text and where to put it", at, spec.usage);
            const textVal = this.eval(args[0]);
            const s = show(textVal).slice(0, 500);
            const rest = args.slice(1).map((a) => this.eval(a));
            let color;
            if (rest.length && isColor(rest[rest.length - 1])) color = rest.pop();
            const nums = [];
            for (const v of rest) {
              if (typeof v === "number") nums.push(v);
              else if (isPoint(v)) nums.push(v.x, v.y);
              else throw rt(`write got ${typeName(v)} where it expected a number`, at, spec.usage);
            }
            if (nums.length < 2 || nums.length > 3) throw rt(`write needs the text, then x and y (got ${nums.length} number${nums.length === 1 ? "" : "s"})`, at, spec.usage);
            if (!this.finite(name, nums, at)) return null;
            const size = q(nums[2] ?? 18);
            if (size <= 0 || s === "") return null;
            this.emit({ k: "text", m: snapMat(st.m), s, x: q(nums[0]), y: q(nums[1]), size, c: toCss(color ?? st.color) }, at);
            return null;
          }
          case "paper": {
            this.drawingAllowed(name, at);
            const c = this.oneColor(name, args, at);
            this.emit({ k: "paper", c: toCss(c) }, at);
            return null;
          }
          case "color": {
            this.state = { ...st, color: this.oneColor(name, args, at) };
            return null;
          }
          case "width": {
            const { nums } = this.numbersAndColor(spec, args, at);
            if (Number.isFinite(nums[0])) this.state = { ...st, width: Math.max(0, nums[0]) };
            return null;
          }
          case "move": {
            const { nums } = this.numbersAndColor(spec, args, at);
            if (!this.finite(name, nums, at)) return null;
            this.state = { ...st, m: mul(st.m, [1, 0, 0, 1, nums[0], nums[1]]) };
            return null;
          }
          case "spin": {
            const { nums } = this.numbersAndColor(spec, args, at);
            if (!this.finite(name, nums, at)) return null;
            const c = Math.cos(nums[0]);
            const s = Math.sin(nums[0]);
            this.state = { ...st, m: mul(st.m, [c, s, -s, c, 0, 0]) };
            return null;
          }
          case "grow": {
            const { nums } = this.numbersAndColor(spec, args, at);
            if (!this.finite(name, nums, at)) return null;
            this.state = { ...st, m: mul(st.m, [nums[0], 0, 0, nums[1] ?? nums[0], 0, 0]) };
            return null;
          }
          case "seed": {
            const { nums } = this.numbersAndColor(spec, args, at);
            this.rand.reseed(nums[0]);
            if (this.mode === "setup") this.frameSeed = nums[0];
            return null;
          }
          case "say": {
            const line = args.map((a) => show(this.eval(a))).join(" ");
            if (this.logs.length < 200) this.logs.push(line);
            return null;
          }
        }
        throw rt(`unknown command ${name}`, at);
      }
      oneColor(name, args, at) {
        if (args.length !== 1) throw rt(`${name} needs one color`, at, `for example: ${name} ember`);
        const v = this.eval(args[0]);
        if (!isColor(v)) {
          throw rt(`${name} needs a color, but got ${typeName(v)}`, args[0].pos, `for example: ${name} ember, ${name} #1d2433 or ${name} hue(200)`);
        }
        return v;
      }
      // ---- expressions ----
      eval(e) {
        this.tick();
        switch (e.t) {
          case "num":
            return e.v;
          case "str":
            return e.v;
          case "bool":
            return e.v;
          case "color":
            return fromHex(e.hex);
          case "name":
            return this.lookup(e.name, e.pos, false);
          case "list": {
            if (e.items.length > this.limits.maxList) throw rt("this list is too long", e.pos);
            return e.items.map((x) => this.eval(x));
          }
          case "point": {
            const x = this.eval(e.x);
            const y = this.eval(e.y);
            if (typeof x !== "number") throw rt(`a point needs numbers, but x is ${typeName(x)}`, e.x.pos);
            if (typeof y !== "number") throw rt(`a point needs numbers, but y is ${typeName(y)}`, e.y.pos);
            return pt(x, y);
          }
          case "un": {
            const a = this.eval(e.a);
            if (e.op === "not") return !truthy(a);
            if (typeof a === "number") return -a;
            if (isPoint(a)) return pt(-a.x, -a.y);
            throw rt(`can't put a minus in front of ${typeName(a)}`, e.pos);
          }
          case "bin": {
            if (e.op === "and") return truthy(this.eval(e.a)) && truthy(this.eval(e.b));
            if (e.op === "or") return truthy(this.eval(e.a)) || truthy(this.eval(e.b));
            return this.binary(e.op, this.eval(e.a), this.eval(e.b), e.pos);
          }
          case "call": {
            const fn = e.fn.t === "name" ? this.lookup(e.fn.name, e.fn.pos, true) : this.eval(e.fn);
            const args = e.args.map((a) => this.eval(a));
            if (!isFn(fn)) {
              const name = e.fn.t === "name" ? e.fn.name : "this";
              throw rt(`${name} is ${typeName(fn)}, not something you can call`, e.fn.pos, typeof fn === "number" ? `to multiply, write ${name} * (\u2026)` : void 0);
            }
            if (fn.kind === "native") return fn.call(args, e.pos, this);
            return this.callUser(fn, args, e.pos);
          }
          case "index": {
            const obj = this.eval(e.obj);
            const idx = this.eval(e.index);
            if (typeof idx !== "number" || !Number.isFinite(idx)) throw rt(`a list position must be a number, not ${typeName(idx)}`, e.index.pos);
            if (isPoint(obj)) {
              const k2 = Math.floor(idx);
              if (k2 === 0) return obj.x;
              if (k2 === 1) return obj.y;
              throw rt(`points only have positions 0 and 1`, e.index.pos, "use p.x and p.y");
            }
            if (!Array.isArray(obj) && typeof obj !== "string") throw rt(`can't take an item from ${typeName(obj)}`, e.obj.pos);
            const n = obj.length;
            let k = Math.floor(idx);
            if (k < 0) k += n;
            if (k < 0 || k >= n) {
              throw rt(
                n === 0 ? "this list is empty, so it has no items" : `this ${Array.isArray(obj) ? "list" : "text"} has ${n} item${n === 1 ? "" : "s"}, numbered 0 to ${n - 1}, so there's no item ${fmtNum(idx)}`,
                e.index.pos,
                n ? "use % len(\u2026) to wrap around, like list[i % len(list)]" : void 0
              );
            }
            return obj[k];
          }
          case "member": {
            const obj = this.eval(e.obj);
            if (isPoint(obj)) {
              if (e.name === "x") return obj.x;
              if (e.name === "y") return obj.y;
              throw rt(`points have .x and .y, not .${e.name}`, e.pos);
            }
            if (isColor(obj) && ["r", "g", "b", "a"].includes(e.name)) return obj[e.name];
            throw rt(`${typeName(obj)} has no .${e.name}`, e.pos, isColor(obj) ? "colors have .r, .g, .b and .a" : void 0);
          }
        }
      }
      lookup(name, at, callee) {
        const scope = this.active.find(name);
        if (scope) return scope.vars.get(name);
        switch (name) {
          case "t":
            return this.time;
          case "turn":
            return Math.PI * 2;
          case "pi":
            return Math.PI;
          case "mouse":
            return this.mouse;
        }
        const fn = this.fns.get(name);
        if (fn) return fn;
        const native2 = NATIVES[name];
        if (native2) {
          if (name === "rand" && !callee) return this.rand.next();
          return native2;
        }
        const color = PALETTE_COLORS[name];
        if (color) return color;
        if (COMMAND_SPECS[name]) throw rt(`${name} is a command, so it goes at the start of a line`, at, COMMAND_SPECS[name].usage);
        const caller = this.callers[this.callers.length - 1];
        if (caller?.scope.find(name)) {
          const fn2 = this.fns.get(caller.fn);
          const params = [...fn2?.params ?? [], name].join(", ");
          throw rt(`${name} belongs to the lines that called ${caller.fn}, so ${caller.fn} can't see it`, at, `hand it over: make ${caller.fn} ${params}, then ${caller.fn} \u2026, ${name}`);
        }
        const known = [...this.allNames()];
        const guess = closest(name, known);
        const syn = SYNONYMS[name.toLowerCase()];
        throw rt(
          `I don't know "${name}" yet`,
          at,
          syn ? `Squiggle calls that ${syn}` : guess ? `did you mean ${guess}?` : `give it a value first, like ${name} = 10`
        );
      }
      *allNames() {
        let s = this.active;
        while (s) {
          yield* s.vars.keys();
          s = s.parent;
        }
        yield* this.fns.keys();
        yield* Object.keys(NATIVES);
        yield* Object.keys(PALETTE);
        yield* ["t", "turn", "pi", "mouse"];
      }
      callUser(fn, args, at) {
        if (args.length !== fn.params.length) {
          const want = fn.params.length;
          throw rt(
            want === 0 ? `${fn.name} doesn't take any values (got ${args.length})` : `${fn.name} needs ${want} value${want === 1 ? "" : "s"}: ${fn.params.join(", ")} (got ${args.length})`,
            at,
            want === 0 ? fn.name : `${fn.name} ${fn.params.join(", ")}`
          );
        }
        if (this.depth >= this.limits.maxDepth) {
          throw rt(`${fn.name} called itself more than ${this.limits.maxDepth} times deep`, at, "make sure it stops calling itself at some point (use if)");
        }
        const scope = new Scope(this.globalsNow());
        fn.params.forEach((p, k) => scope.vars.set(p, args[k]));
        const outer = this.active;
        this.callers.push({ fn: fn.name, scope: outer });
        this.active = scope;
        this.depth++;
        try {
          return this.execBlock(fn.body);
        } finally {
          this.depth--;
          this.active = outer;
          this.callers.pop();
        }
      }
      globalsNow() {
        let s = this.active;
        while (s.parent) s = s.parent;
        return s;
      }
      binary(op, a, b, at) {
        if ("+-*/%^".includes(op) && (typeof a === "boolean" || typeof b === "boolean") && (typeof a === "number" || typeof a === "boolean") && (typeof b === "number" || typeof b === "boolean")) {
          a = Number(a);
          b = Number(b);
        }
        switch (op) {
          case "+":
            if (typeof a === "number" && typeof b === "number") return a + b;
            if (typeof a === "string" || typeof b === "string") {
              const s = show(a) + show(b);
              if (s.length > this.limits.maxText) throw rt(`this text is longer than ${this.limits.maxText} characters`, at);
              return s;
            }
            if (Array.isArray(a) && Array.isArray(b)) {
              if (a.length + b.length > this.limits.maxList) {
                throw rt(`this list would have more than ${this.limits.maxList.toLocaleString("en-US")} items, which is the most a list can hold`, at, "use fewer items");
              }
              return a.concat(b);
            }
            if (Array.isArray(a)) throw rt(`can't add ${typeName(b)} to a list directly`, at, "wrap it in brackets: list + [item]");
            break;
          case "-":
            if (typeof a === "number" && typeof b === "number") return a - b;
            break;
          case "*":
            if (typeof a === "number" && typeof b === "number") return a * b;
            if (isPoint(a) && typeof b === "number") return pt(a.x * b, a.y * b);
            if (typeof a === "number" && isPoint(b)) return pt(a * b.x, a * b.y);
            if (isPoint(a) && isPoint(b)) return pt(a.x * b.x, a.y * b.y);
            break;
          case "/":
            if (typeof a === "number" && typeof b === "number") return a / b;
            if (isPoint(a) && typeof b === "number") return pt(a.x / b, a.y / b);
            break;
          case "%":
            if (typeof a === "number" && typeof b === "number") {
              if (b === 0) return NaN;
              return a - b * Math.floor(a / b);
            }
            break;
          case "^":
            if (typeof a === "number" && typeof b === "number") return Math.pow(a, b);
            break;
          case "==":
            return equal(a, b);
          case "!=":
            return !equal(a, b);
          case "<":
          case ">":
          case "<=":
          case ">=":
            if (typeof a === "number" && typeof b === "number") {
              return op === "<" ? a < b : op === ">" ? a > b : op === "<=" ? a <= b : a >= b;
            }
            if (typeof a === "string" && typeof b === "string") {
              return op === "<" ? a < b : op === ">" ? a > b : op === "<=" ? a <= b : a >= b;
            }
            throw rt(`${op} compares numbers, but got ${typeName(a)} and ${typeName(b)}`, at);
        }
        if ((op === "+" || op === "-") && isPoint(a) && isPoint(b)) return pt(op === "+" ? a.x + b.x : a.x - b.x, op === "+" ? a.y + b.y : a.y - b.y);
        if ((op === "+" || op === "-") && isPoint(a) && typeof b === "number") return pt(op === "+" ? a.x + b : a.x - b, op === "+" ? a.y + b : a.y - b);
        const verb = { "+": "add", "-": "subtract", "*": "multiply", "/": "divide", "%": "take % of", "^": "raise" }[op] ?? op;
        let hint;
        if (isColor(a) || isColor(b)) hint = "to blend colors use mix(a, b, k); to see through one use fade(c, k)";
        else if (a === null || b === null) hint = "a make whose last line is a command gives back nothing; end it with a value";
        throw rt(`can't ${verb} ${typeName(a)} and ${typeName(b)}`, at, hint);
      }
    };
    COMMAND_SPECS = Object.fromEntries(COMMANDS.map((c) => [c.name, c]));
    FN_SPECS = Object.fromEntries(FUNCTIONS.map((f) => [f.name, f]));
    native = (name, call) => ({
      kind: "native",
      name,
      call: (args, at, self) => {
        checkArity(name, args, at);
        return call(args, at, self);
      }
    });
    NATIVES = {
      sin: math1("sin", Math.sin),
      cos: math1("cos", Math.cos),
      tan: math1("tan", Math.tan),
      sqrt: math1("sqrt", Math.sqrt),
      abs: math1("abs", Math.abs),
      floor: math1("floor", Math.floor),
      ceil: math1("ceil", Math.ceil),
      round: math1("round", Math.round),
      sign: math1("sign", Math.sign),
      ease: math1("ease", (k) => {
        const x = Math.max(0, Math.min(1, k));
        return x * x * x * (x * (x * 6 - 15) + 10);
      }),
      atan: native("atan", (a, at) => Math.atan2(num("atan", a[0], at), num("atan", a[1], at))),
      min: native("min", (a, at) => {
        const xs = a.length === 1 && Array.isArray(a[0]) ? a[0] : a;
        if (!xs.length) throw rt("min needs at least one number", at);
        return Math.min(...xs.map((x) => num("min", x, at)));
      }),
      max: native("max", (a, at) => {
        const xs = a.length === 1 && Array.isArray(a[0]) ? a[0] : a;
        if (!xs.length) throw rt("max needs at least one number", at);
        return Math.max(...xs.map((x) => num("max", x, at)));
      }),
      lerp: native("lerp", ([a, b, k], at) => {
        const kk = num("lerp", k, at, "a number for k");
        if (typeof a === "number" && typeof b === "number") return a + (b - a) * kk;
        if (isPoint(a) && isPoint(b)) return pt(a.x + (b.x - a.x) * kk, a.y + (b.y - a.y) * kk);
        if (isColor(a) && isColor(b)) return mix(a, b, kk);
        throw rt(`lerp goes between two numbers, two points or two colors, not ${typeName(a)} and ${typeName(b)}`, at, "lerp(a, b, k)");
      }),
      clamp: native("clamp", (a, at) => {
        const x = num("clamp", a[0], at);
        const lo = a.length > 1 ? num("clamp", a[1], at) : 0;
        const hi = a.length > 2 ? num("clamp", a[2], at) : 1;
        return Math.max(Math.min(lo, hi), Math.min(Math.max(lo, hi), x));
      }),
      noise: native("noise", (a, at) => noise3(num("noise", a[0], at), a.length > 1 ? num("noise", a[1], at) : 0, a.length > 2 ? num("noise", a[2], at) : 0)),
      rand: native("rand", (a, at, self) => {
        const r = self.rand.next();
        if (a.length === 0) return r;
        if (a.length === 1) return r * num("rand", a[0], at);
        const lo = num("rand", a[0], at);
        return lo + r * (num("rand", a[1], at) - lo);
      }),
      pick: native("pick", ([list], at, self) => {
        if (!Array.isArray(list) && typeof list !== "string") throw rt(`pick needs a list, but got ${typeName(list)}`, at, "pick([ember, sea, moss])");
        if (!list.length) throw rt("pick needs a list with something in it", at);
        return list[Math.floor(self.rand.next() * list.length)];
      }),
      hue: native("hue", (a, at) => hue(num("hue", a[0], at), a.length > 1 ? num("hue", a[1], at) : void 0, a.length > 2 ? num("hue", a[2], at) : void 0)),
      mix: native("mix", ([a, b, k], at) => mix(col("mix", a, at), col("mix", b, at), num("mix", k, at, "a number for k"))),
      fade: native("fade", ([c, k], at) => fade(col("fade", c, at), num("fade", k, at))),
      rgb: native("rgb", (a, at) => rgba(num("rgb", a[0], at), num("rgb", a[1], at), num("rgb", a[2], at), a.length > 3 ? num("rgb", a[3], at) : 1)),
      polar: native("polar", ([r, a], at) => {
        const rr = num("polar", r, at);
        const aa = num("polar", a, at);
        return pt(rr * Math.cos(aa), rr * Math.sin(aa));
      }),
      dist: native("dist", ([a, b], at) => {
        if (!isPoint(a) || !isPoint(b)) throw rt("dist needs two points", at, "dist((0, 0), (30, 40))");
        return Math.hypot(a.x - b.x, a.y - b.y);
      }),
      len: native("len", ([v], at) => {
        if (Array.isArray(v) || typeof v === "string") return v.length;
        throw rt(`len needs a list or text, but got ${typeName(v)}`, at);
      }),
      range: native("range", ([n], at, self) => {
        const k = Math.floor(num("range", n, at));
        if (k > self.limits.maxList) throw rt(`range(${k}) would be longer than ${self.limits.maxList.toLocaleString("en-US")} items`, at);
        return Array.from({ length: Math.max(0, k) }, (_, i) => i);
      })
    };
    Shell = class {
      state = { globals: new Scope(null), fns: /* @__PURE__ */ new Map(), rand: new Rand(1) };
      run(chunk) {
        const it = new Interp(chunk, {}, this.state.fns.keys());
        it.attach(this.state);
        const { value, logs } = it.evaluate();
        const last = it.program.body[it.program.body.length - 1];
        const showValue = last !== void 0 && (last.t === "expr" || last.t === "callstmt" && value !== null);
        return { value, text: showValue ? show(value) : "", logs };
      }
    };
  }
});

// ../core/src/render-canvas.ts
function drawFrame(ctx, ops, px = SIZE) {
  const s = px / SIZE;
  const half = px / 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const op of ops) {
    if (op.k === "paper") {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = op.c;
      ctx.fillRect(0, 0, px, px);
      continue;
    }
    ctx.setTransform(s, 0, 0, -s, half, half);
    const m = op.m;
    if (!isIdentity(m)) ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
    switch (op.k) {
      case "dot":
        ctx.fillStyle = op.c;
        ctx.beginPath();
        ctx.arc(op.x, op.y, op.r, 0, Math.PI * 2);
        ctx.fill();
        break;
      case "ring":
        if (op.w <= 0) break;
        ctx.strokeStyle = op.c;
        ctx.lineWidth = op.w;
        ctx.beginPath();
        ctx.arc(op.x, op.y, op.r, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case "box":
        ctx.fillStyle = op.c;
        ctx.fillRect(op.x - op.w / 2, op.y - op.h / 2, op.w, op.h);
        break;
      case "line":
        if (op.w <= 0) break;
        ctx.strokeStyle = op.c;
        ctx.lineWidth = op.w;
        ctx.beginPath();
        ctx.moveTo(op.x1, op.y1);
        ctx.lineTo(op.x2, op.y2);
        ctx.stroke();
        break;
      case "path":
      case "shape": {
        const p = op.p;
        ctx.beginPath();
        ctx.moveTo(p[0], p[1]);
        for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
        if (op.k === "shape") {
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
      case "text":
        ctx.translate(op.x, op.y);
        ctx.scale(1, -1);
        ctx.fillStyle = op.c;
        ctx.font = `${op.size}px ${FONT_STACK}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(op.s, 0, 0);
        break;
    }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
var TEXT_FONT, FONT_STACK;
var init_render_canvas = __esm({
  "../core/src/render-canvas.ts"() {
    "use strict";
    init_ops();
    init_vocab();
    TEXT_FONT = "Fraunces";
    FONT_STACK = `"${TEXT_FONT}", Georgia, serif`;
  }
});

// ../core/src/render-svg.ts
var init_render_svg = __esm({
  "../core/src/render-svg.ts"() {
    "use strict";
    init_ops();
    init_vocab();
    init_render_canvas();
  }
});

// ../core/src/share.ts
function postText(code) {
  return code.replace(/\r\n?/g, "\n").replace(/[ \t]+$/gm, "").replace(/^\n+/, "").replace(/\n+$/, "");
}
function postLength(code) {
  let n = 0;
  for (const ch of postText(code)) {
    const cp = ch.codePointAt(0);
    const light = cp >= 0 && cp <= 4351 || cp >= 8192 && cp <= 8205 || cp >= 8208 && cp <= 8223 || cp >= 8242 && cp <= 8247;
    n += light ? 1 : 2;
  }
  return n;
}
var init_share = __esm({
  "../core/src/share.ts"() {
    "use strict";
  }
});

// ../core/src/format.ts
function logicalLines(tokens) {
  const out = [];
  let depth = 0;
  let cur = [];
  for (const t of tokens) {
    if (t.type === "indent") depth++;
    else if (t.type === "dedent") depth--;
    else if (t.type === "newline" || t.type === "eof") {
      if (cur.length) out.push({ depth, toks: cur, first: cur[0].line, last: cur[cur.length - 1].line });
      cur = [];
    } else cur.push(t);
  }
  return out;
}
function spaceMatters(prev, t) {
  if (!(isWordTok(prev) || closes(prev))) return false;
  if (t.type === "op" && (t.text === "(" || t.text === "[")) return true;
  if (t.type === "op" && t.text === "-" && t.unary) return true;
  return false;
}
function tidyJoin(toks) {
  let s = "";
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    const prev = toks[k - 1];
    if (k > 0) {
      let space = true;
      if (t.type === "op" && (t.text === "," || t.text === ")" || t.text === "]")) space = false;
      else if (prev.type === "op" && (prev.text === "(" || prev.text === "[")) space = false;
      else if (t.type === "op" && t.text === ".") space = false;
      else if (prev.type === "op" && prev.text === ".") space = false;
      else if (prev.type === "op" && prev.text === "-" && prev.unary) space = false;
      else if (spaceMatters(prev, t)) space = t.space;
      s += space ? " " : "";
    }
    s += t.text;
  }
  return s;
}
function tidy(source) {
  const prog = parse(source);
  const lines = logicalLines(prog.tokens);
  const srcLines = source.replace(/\r\n?/g, "\n").split("\n");
  const blank = (n) => (srcLines[n - 1] ?? "").trim() === "";
  const own = prog.comments.filter((c) => c.own);
  const trailing = /* @__PURE__ */ new Map();
  for (const c of prog.comments) if (!c.own) trailing.set(c.line, c.text);
  const out = [];
  let lastSrc = 0;
  let oi = 0;
  const gap = (from, to) => {
    for (let n = from + 1; n < to; n++) if (blank(n)) return true;
    return false;
  };
  const pushLine = (text, src) => {
    if (out.length && gap(lastSrc, src)) out.push("");
    out.push(text);
    lastSrc = src;
  };
  for (const line of lines) {
    while (oi < own.length && own[oi].line < line.first) {
      pushLine("  ".repeat(line.depth) + "//" + own[oi].text.replace(/\s+$/, ""), own[oi].line);
      oi++;
    }
    let text = "  ".repeat(line.depth) + tidyJoin(line.toks);
    for (let n = line.first; n <= line.last; n++) {
      const c = trailing.get(n);
      if (c !== void 0) text += " //" + c.replace(/\s+$/, "");
    }
    pushLine(text, line.last);
  }
  while (oi < own.length) {
    pushLine("//" + own[oi].text.replace(/\s+$/, ""), own[oi].line);
    oi++;
  }
  return out.join("\n") + "\n";
}
function shortNumber(t) {
  const v = t.value;
  let s = String(v);
  if (/e/i.test(s)) return t.text;
  if (s.startsWith("0.")) s = s.slice(1);
  return s.length < t.text.length ? s : t.text;
}
function shortColor(hex) {
  const c = fromHex(hex);
  for (const [name, pc] of Object.entries(PALETTE_COLORS)) {
    if (sameColor(c, pc) && name.length < hex.length + 1) return name;
  }
  let h = hex;
  if (h.length === 8 && h.endsWith("ff")) h = h.slice(0, 6);
  if ((h.length === 6 || h.length === 8) && [...h].every((ch, k) => k % 2 === 1 || ch === h[k + 1])) {
    h = [...h].filter((_, k) => k % 2 === 0).join("");
  }
  return "#" + h;
}
function* shortNames() {
  const letters = "abcdefghjklmnopqrsuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (const a of letters) yield a;
  for (const a of letters) for (const b of letters + "0123456789_") yield a + b;
}
function squeezeJoin(toks, rename) {
  let s = "";
  let prev = null;
  for (const t of toks) {
    let text = t.text;
    if (t.type === "num") text = shortNumber(t);
    else if (t.type === "color") text = shortColor(t.value);
    else if (t.type === "name" && rename?.has(t.text) && !(prev && prev.type === "op" && prev.text === ".")) text = rename.get(t.text);
    if (prev) {
      const a = s[s.length - 1];
      const b = text[0];
      let space = WORD.test(a) && WORD.test(b);
      if (b === "." && /[0-9]/.test(text[1] ?? "") && WORD.test(a)) space = true;
      if (spaceMatters(prev, t) && t.space) space = true;
      if (prev.type === "op" && t.type === "op" && BINARY.has(t.text) && (BINARY.has(a + b) || a === "/" && b === "/")) space = true;
      if (space) s += " ";
    }
    s += text;
    prev = t;
  }
  return s;
}
function dropAsI(toks) {
  const k = toks.length;
  if (k >= 4 && toks[0].text === "repeat" && toks[k - 2].text === "as" && toks[k - 1].text === "i" && toks[k - 2].type === "name") {
    return toks.slice(0, k - 2);
  }
  return toks;
}
function render(lines, rename, asI) {
  return lines.map((l) => " ".repeat(l.depth) + squeezeJoin(asI ? dropAsI(l.toks) : l.toks, rename)).join("\n");
}
function fingerprint(code) {
  const it = new Interp(code);
  const times = it.animated ? [0, 0.37, 1, 2.5, 6.1] : [0];
  return times.map((t) => {
    const f = it.frame(t);
    return hashOps(f.ops) + f.logs.join("");
  }).join("|");
}
function squeeze(source) {
  const prog = parse(source);
  const before = postLength(source);
  const lines = logicalLines(prog.tokens);
  const reference = fingerprint(source);
  const counts = /* @__PURE__ */ new Map();
  for (let k = 0; k < prog.tokens.length; k++) {
    const t = prog.tokens[k];
    const prev = prog.tokens[k - 1];
    if (t.type !== "name" || RESERVED.has(t.text) || KEYWORD_NAMES.has(t.text)) continue;
    if (prev && prev.type === "op" && prev.text === ".") continue;
    counts.set(t.text, (counts.get(t.text) ?? 0) + 1);
  }
  const taken = new Set([...counts.keys()].filter((n) => n.length === 1));
  taken.add("i");
  const rename = /* @__PURE__ */ new Map();
  const gen = shortNames();
  for (const [name] of [...counts].filter(([n]) => n.length > 1).sort((a, b) => b[1] * b[0].length - a[1] * a[0].length)) {
    let next = gen.next();
    while (!next.done && (taken.has(next.value) || RESERVED.has(next.value) || counts.has(next.value))) next = gen.next();
    if (next.done || next.value.length >= name.length) continue;
    rename.set(name, next.value);
    taken.add(next.value);
  }
  const attempts = [
    [rename.size ? rename : null, true, ["spacing", "numbers", "colors", rename.size ? "names" : "", "repeat as i"].filter(Boolean)],
    [null, true, ["spacing", "numbers", "colors", "repeat as i"]],
    [null, false, ["spacing", "numbers", "colors"]]
  ];
  for (const [ren, asI, steps] of attempts) {
    const code2 = render(lines, ren, asI);
    try {
      if (fingerprint(code2) === reference) return { code: code2, before, after: postLength(code2), steps };
    } catch {
    }
  }
  const code = tidy(source).trimEnd();
  return { code, before, after: postLength(code), steps: ["tidy only"] };
}
var WORD, isWordTok, closes, BINARY;
var init_format = __esm({
  "../core/src/format.ts"() {
    "use strict";
    init_parser();
    init_interpreter();
    init_ops();
    init_color();
    init_vocab();
    init_share();
    WORD = /[A-Za-z0-9_]/;
    isWordTok = (t) => t.type === "name" || t.type === "num" || t.type === "str" || t.type === "color";
    closes = (t) => t.type === "op" && (t.text === ")" || t.text === "]");
    BINARY = /* @__PURE__ */ new Set(["+", "-", "*", "/", "%", "^", "=", "+=", "-=", "*=", "/=", "==", "!=", "<", ">", "<=", ">="]);
  }
});

// ../core/src/highlight.ts
var init_highlight = __esm({
  "../core/src/highlight.ts"() {
    "use strict";
    init_vocab();
  }
});

// ../core/src/site.ts
var SITE_URL;
var init_site = __esm({
  "../core/src/site.ts"() {
    "use strict";
    SITE_URL = "https://squigglee.online";
  }
});

// ../core/src/examples.gen.ts
var EXAMPLES;
var init_examples_gen = __esm({
  "../core/src/examples.gen.ts"() {
    "use strict";
    EXAMPLES = [
      {
        "slug": "abacus",
        "title": "abacus",
        "code": "box 0, 0, 480, 440, rust\nbox 0, 0, 444, 404, bone\nevery frame\n  repeat 8 as r\n    y = 168 - r * 48\n    line -222, y, 222, y, ash\n    d = 5 + sin(t * turn / 3 + r) * 5\n    repeat 10 as j\n      dot j * 30 - 200 + ease(clamp(j + 1 - d)) * 130, y, 15, [ember, ink][r % 2]\n"
      },
      {
        "slug": "bloom",
        "title": "bloom",
        "code": "every frame\n  o = 0.75 + sin(t * turn / 3) * 0.25\n  repeat 4 as k\n    repeat 10 as i\n      keep\n        spin i * turn / 10 + k * 0.3 + t * 0.1\n        move 0, (110 - k * 24) * o\n        grow 0.38, 1\n        dot 0, 0, 110 - k * 24, mix(rose, ember, k / 3)\n  dot 0, 0, 30 * o, ochre\n"
      },
      {
        "slug": "city-lights",
        "title": "city lights",
        "code": "paper night\ndot 150, 170, 30, bone\nevery frame\n  seed 5\n  repeat 12 as b\n    h = rand(80, 400)\n    box b * 40 - 220, h / 2 - 256, 36, h, coal\n    repeat h / 7 as j\n      box b * 40 - 230 + j % 3 * 10, floor(j / 3) * 20 - 236, 5, 9, fade(ochre, sin(t / 2 + rand(99)) * 2 - 1)\n"
      },
      {
        "slug": "clockwork",
        "title": "clockwork",
        "code": "grow 1.3\nmake gear x, y, n, a\n  move x, y\n  spin a\n  dot 0, 0, n * 5\n  repeat n\n    spin turn / n\n    box n * 5, 0, 22, 15\n  dot 0, 0, n, ember\n  spin -a\nevery frame\n  a = t * turn / 12\n  gear -50, 0, 20, a\n  gear 138, 94, 12, 5 - a * 5 / 3\n  gear -47, -209, 8, 0.38 - a * 2.5\n"
      },
      {
        "slug": "compass",
        "title": "compass",
        "code": 'width 6\nring 0, 0, 206\nwidth 2\nrepeat 72 as i\n  line 0, 150 + min(i % 9, 1) * 28, 0, 194\n  spin turn / 72\nwrite "N", 0, 126, 34\nevery frame\n  spin sin(t * turn / 3) * 0.3\n  for c in [ember, ink]\n    shape [(0, 150), (-18, 0), (18, 0)], c\n    spin pi\n  dot 0, 0, 9, bone\n'
      },
      {
        "slug": "coral",
        "title": "coral",
        "code": "paper sea\nmake arm p, a, n\n  q = p + polar(rand(35, 60), a + sin(t + n) / 9)\n  width n * 3 + 5\n  line p, q\n  if n > 0\n    for s in [1, -1]\n      arm q, a + s * rand(0.6), n - 1\nevery frame\n  repeat 5\n    color mix(rose, ochre, i / 4)\n    arm (i * 100 - 200, -256), rand(1, 2.1), 5\n"
      },
      {
        "slug": "heartbeat",
        "title": "heartbeat",
        "code": "paper ink\nmake bump c, w\n  max(0, 1 - abs(u - c) / w)\nevery frame\n  width 4\n  last = (-240, 0)\n  repeat 121 as i\n    u = i % 40\n    p = (i * 4 - 240, bump(20, 1) * 150 - bump(22, 2) * 50 + bump(30, 4) * 30)\n    line last, p, fade(ember, 1 - (t * 40 - i) % 120 / 108)\n    last = p\n"
      },
      {
        "slug": "honeycomb",
        "title": "honeycomb",
        "code": "paper bone\nevery frame\n  repeat 10 as r\n    repeat 11 as c\n      o = (c * 52 - 260 + r % 2 * 26, r * 45 - 202)\n      h = []\n      repeat 6 as k\n        h = h + [o + polar(27, k * turn / 6 + turn / 12)]\n      shape h, mix(sand, ochre, sin(dist(o, (0, 0)) / 60 - t * 2) + 0.5)\n"
      },
      {
        "slug": "hourglass",
        "title": "hourglass",
        "code": "glass = [(0, 0), (-90, 180), (90, 180), (0, 0)]\nevery frame\n  f = clamp(t % 3 / 2)\n  spin ease(t % 3 - 2) * pi\n  repeat 2\n    spin pi\n    path glass\n    box 0, 190, 230, 20\n  color ochre\n  shape [(-90, -180), (90, -180), (0, f * 125 - 180)]\n  grow sqrt(1 - f) * 0.83\n  shape glass\n"
      },
      {
        "slug": "jellyfish",
        "title": "jellyfish",
        "code": "paper night\nevery frame\n  s = sin(t * turn / 1.5)\n  move 0, 110 + s * 10\n  grow 1, 1 - s / 9\n  dot 0, 0, 110, fade(rose, 0.85)\n  box 0, -60, 240, 120, night\n  repeat 13 as k\n    repeat 36 as j\n      dot k * 18 - 108 + sin(j / 6 - t * 4 + k) * j / 2, j * -8, 2, fade(lilac, 0.6)\n"
      },
      {
        "slug": "kaleidoscope",
        "title": "kaleidoscope",
        "code": "paper night\nevery frame\n  repeat 6\n    spin turn / 6\n    repeat 2\n      grow 1, -1\n      repeat 6 as i\n        p = polar(30 + i * 36, noise(i, t / 4) * 0.4 + 0.25)\n        shape [p, p + polar(60, t / 2 + i), p + polar(50, i * 2)], fade(hue(i * 50 + t * 30, 0.5), 0.5)\n"
      },
      {
        "slug": "loom",
        "title": "loom",
        "code": "width 5\nrepeat 27\n  line i * 20 - 260, -256, i * 20 - 260, 240, ash\nevery frame\n  u = t / 1.5\n  box cos(u * pi) * 220, 0, 50, 12\n  grow 1, 0.4\n  repeat 17 as k\n    n = floor(u) - k\n    repeat 14\n      dot i * 40 - 260 + n % 2 * 20, (n - u) * 40, 17, mix(clay, ochre, n % 3 / 2)\n"
      },
      {
        "slug": "mobile",
        "title": "mobile",
        "code": "line 0, 256, 0, 210\nmake hang p, w, n\n  e = cos(t / n + n) * w\n  for s in [-e, e]\n    q = p + (s, rand(-130, -70))\n    path [p, p + (s, 0), q]\n    dot q, 24 / n / n, pick([ember, ochre, sea, ink])\n    if n > 1\n      hang q, w * 0.6, n - 1\nevery frame\n  hang (0, 210), 120, 3\n"
      },
      {
        "slug": "moth",
        "title": "moth",
        "code": "paper night\nevery frame\n  f = 0.8 + sin(t * 4) / 5\n  for s in [1, -1]\n    keep\n      grow s * f, 1\n      dot 90, -60, 80, clay\n      shape [(0, 40), (240, 100), (170, -50)], sand\n      dot 110, -90, 20, ember\n      line 6, 50, 50, 150, sand\n  width 26\n  line 0, 40, 0, -110, bone\n"
      },
      {
        "slug": "murmuration",
        "title": "murmuration",
        "code": "repeat 8\n  box 0, 224 - i * 64, 512, 64, mix(rose, bone, i / 7)\nevery frame\n  repeat 800\n    k = i / 400\n    x = noise(k, t / 6) * 320 + rand(-30, 30) * rand\n    y = noise(k + 9, t / 6) * 220 + rand(-30, 30) * rand + 30\n    dot x, y, rand(1.2, 2.6), ink\n"
      },
      {
        "slug": "nautilus",
        "title": "nautilus",
        "code": "paper bone\npts = []\nrepeat 241\n  a = i * turn / 70\n  pts = pts + [polar(5.6 * 3 ^ (a / turn), a)]\nshape pts, sand\nwidth 3\npath pts, ink\nwidth 2\nrepeat 26\n  a = i * 0.59 + turn\n  r = 5.6 * 3 ^ (a / turn)\n  path [polar(r / 3, a), polar(r / 1.7, a + 0.2), polar(r, a)], clay\n"
      },
      {
        "slug": "orbit-garden",
        "title": "orbit garden",
        "code": "paper ink\nevery frame\n  repeat 48 as i\n    a = i / 48 * turn + t * 0.3\n    dot cos(a) * 140, sin(a * 2) * 90, 3, hue(i * 7)\n"
      },
      {
        "slug": "pinwheel",
        "title": "pinwheel",
        "code": "width 8\nline 0, 0, 20, -256, clay\nevery frame\n  spin -t * pi / 3\n  repeat 4\n    spin turn / 4\n    shape [(0, 0), (0, 170), (-120, 120)], [ember, ochre][i % 2]\n    shape [(0, 0), (-120, 120), (-60, 40)], [rust, clay][i % 2]\n  dot 0, 0, 10, ink\n"
      },
      {
        "slug": "pond",
        "title": "pond",
        "code": "paper sea\ndot -150, 150, 60, moss\nat = (0, 0)\nfrom = 0\nwhen click\n  at = mouse\n  from = t\nevery frame\n  d = (t - from) % 3\n  repeat 3\n    ring at, d * 120 / (i + 1), fade(chalk, 1 - d / 3)\n  repeat 20\n    dot polar(140, t / 2 + i % 2 * pi - i / 17), 22 - i, [ember, chalk][i % 2]\n"
      },
      {
        "slug": "rain-on-a-window",
        "title": "rain on a window",
        "code": "paper night\nrepeat 140\n  r = rand(1, 5) ^ 2.4\n  dot rand(-256, 256), rand(-256, 256), r, fade(sand, 2 / r)\nevery frame\n  repeat 16\n    x = rand(-240, 240)\n    y = 290 - (t * 50 + i * 37 - sin(t * turn + i) * 8) % 660\n    line x, y, x, y + 60, fade(bone, 0.2)\n    dot x, y, 6, bone\n"
      },
      {
        "slug": "sand",
        "title": "sand",
        "code": "paper bone\ndot 110, 140, 44, ember\nevery frame\n  repeat 5 as k\n    pts = [(-256, -256)]\n    repeat 33 as i\n      x = i * 16 - 256\n      pts = pts + [(x, 70 - k * 60 - abs(noise(x / 220 + k * 4 - t / 12, k)) * 120)]\n    shape pts + [(256, -256)], mix(sand, clay, k / 4)\n"
      },
      {
        "slug": "seed-head",
        "title": "seed head",
        "code": "blow = 0\nwhen click\n  blow = t\nbox 0, -128, 4, 256, moss\nwidth 1\nevery frame\n  repeat 90\n    d = max(0, (t - blow) % 6 - i / 30)\n    p = polar(120, i * 2.4) + (d * 70, d * 40 + sin(d + i) * 20)\n    line p - polar(110 / (1 + d * 9), i * 2.4), p, ash\n    dot p, 9, fade(ash, 0.25)\n"
      },
      {
        "slug": "signal",
        "title": "signal",
        "code": "move 0, 40\nwidth 4\npath [(-70, -270), (0, 0), (70, -270)]\nzig = [(0, 0)]\nrepeat 8 as i\n  zig = zig + [((i % 2 - 0.5) * i * 18, -i * 34)]\npath zig\ndot 0, 0, 12, ember\nevery frame\n  width 5\n  repeat 5 as k\n    r = (t / 3 + k / 5) % 1\n    ring 0, 0, r * 230 + 24, fade(ink, 1 - r)\n"
      },
      {
        "slug": "snowfall",
        "title": "snowfall",
        "code": "paper night\ndot -140, -560, 360, bone\ndot 220, -600, 400, chalk\nevery frame\n  repeat 200\n    s = rand(1, 4)\n    y = 270 - (t * s * 20 + rand(540)) % 540\n    dot rand(-256, 256) + sin(t + y / 50) * 10, y, s, fade(chalk, s / 4)\n"
      },
      {
        "slug": "spider-web",
        "title": "spider web",
        "code": "paper night\ncolor bone\nwidth 1\nrepeat 16\n  line 0, 0, polar(330, i * turn / 16)\npts = []\nrepeat 190\n  pts = pts + [polar(16 + i * 1.25 + noise(i / 7) * 8, i * turn / 16)]\npath pts\nseed 3\nrepeat 50\n  dot polar(rand(20, 250), floor(rand(16)) * turn / 16), rand(1, 4), sky\n"
      },
      {
        "slug": "tide",
        "title": "tide",
        "code": "dot 0, 100, 60, ember\nevery frame\n  p = t * turn / 3\n  repeat 6 as k\n    pts = [(-256, -256)]\n    repeat 33 as i\n      y = sin(i / (2.5 + k) - p + k) * (5 + k * 3) + sin(p) * 10 + 60 - k * 44\n      pts = pts + [(i * 16 - 256, y)]\n    shape pts + [(256, -256)], fade(sea, 0.32)\n"
      },
      {
        "slug": "tides-of-dots",
        "title": "tides of dots",
        "code": "every frame\n  p = t * turn / 3\n  repeat 20 as j\n    repeat 26 as i\n      x = i * 20 - 250\n      w = sin(x / 50 - p + j / 2)\n      dot x, j * 24 - 228 + w * 10, 9 - j / 3 + w * 2, mix(sea, sky, j / 19)\n"
      },
      {
        "slug": "tree-rings",
        "title": "tree rings",
        "code": "paper bone\ndot 0, 0, 205, sand\nr = 6\nrepeat 30 as k\n  r += rand(4, 9)\n  pts = []\n  repeat 73 as i\n    a = i * turn / 72\n    pts = pts + [polar(r + noise(cos(a) * 2, sin(a) * 2, k / 8) * r / 6, a)]\n  width rand(1, 3)\n  path pts, mix(clay, rust, rand)\nwidth 16\npath pts, coal\n"
      },
      {
        "slug": "tunnel",
        "title": "tunnel",
        "code": "paper night\nevery frame\n  m = t * 2 / 3\n  repeat 24 as k\n    z = k + 1 - m % 1\n    c = [clay, coal][(k + floor(m)) % 2]\n    keep\n      spin z * 0.16\n      box 0, 0, 900 / z, 900 / z, mix(c, night, z / 24)\n"
      },
      {
        "slug": "wheat",
        "title": "wheat",
        "code": "every frame\n  repeat 9 as k\n    x = k * 52 - 208\n    w = noise(k / 2, t / 3) * 50\n    line x, -256, x + w, 80, ochre\n    repeat 16 as j\n      s = j % 2 - 0.5\n      p = (x + w * (1 + j / 40) + s * 14, 80 + j * 9)\n      dot p, 6, ochre\n      line p, p + (s * 20 + w / 4, 40), sand\n"
      }
    ];
  }
});

// ../core/src/brand.ts
var init_brand = __esm({
  "../core/src/brand.ts"() {
    "use strict";
  }
});

// ../core/src/index.ts
var init_src = __esm({
  "../core/src/index.ts"() {
    "use strict";
    init_errors();
    init_lexer();
    init_parser();
    init_interpreter();
    init_ops();
    init_render_canvas();
    init_render_svg();
    init_share();
    init_color();
    init_vocab();
    init_interpreter();
    init_format();
    init_highlight();
    init_site();
    init_examples_gen();
    init_brand();
  }
});

// ../../node_modules/gifenc/dist/gifenc.js
var require_gifenc = __commonJS({
  "../../node_modules/gifenc/dist/gifenc.js"(exports) {
    var __defProp2 = Object.defineProperty;
    var __markAsModule = (target) => __defProp2(target, "__esModule", { value: true });
    var __export2 = (target, all) => {
      for (var name in all)
        __defProp2(target, name, { get: all[name], enumerable: true });
    };
    __markAsModule(exports);
    __export2(exports, {
      GIFEncoder: () => GIFEncoder2,
      applyPalette: () => applyPalette2,
      default: () => src_default,
      nearestColor: () => nearestColor,
      nearestColorIndex: () => nearestColorIndex,
      nearestColorIndexWithDistance: () => nearestColorIndexWithDistance,
      prequantize: () => prequantize,
      quantize: () => quantize2,
      snapColorsToPalette: () => snapColorsToPalette
    });
    var constants_default = {
      signature: "GIF",
      version: "89a",
      trailer: 59,
      extensionIntroducer: 33,
      applicationExtensionLabel: 255,
      graphicControlExtensionLabel: 249,
      imageSeparator: 44,
      signatureSize: 3,
      versionSize: 3,
      globalColorTableFlagMask: 128,
      colorResolutionMask: 112,
      sortFlagMask: 8,
      globalColorTableSizeMask: 7,
      applicationIdentifierSize: 8,
      applicationAuthCodeSize: 3,
      disposalMethodMask: 28,
      userInputFlagMask: 2,
      transparentColorFlagMask: 1,
      localColorTableFlagMask: 128,
      interlaceFlagMask: 64,
      idSortFlagMask: 32,
      localColorTableSizeMask: 7
    };
    function createStream(initialCapacity = 256) {
      let cursor = 0;
      let contents = new Uint8Array(initialCapacity);
      return {
        get buffer() {
          return contents.buffer;
        },
        reset() {
          cursor = 0;
        },
        bytesView() {
          return contents.subarray(0, cursor);
        },
        bytes() {
          return contents.slice(0, cursor);
        },
        writeByte(byte) {
          expand2(cursor + 1);
          contents[cursor] = byte;
          cursor++;
        },
        writeBytes(data, offset = 0, byteLength = data.length) {
          expand2(cursor + byteLength);
          for (let i = 0; i < byteLength; i++) {
            contents[cursor++] = data[i + offset];
          }
        },
        writeBytesView(data, offset = 0, byteLength = data.byteLength) {
          expand2(cursor + byteLength);
          contents.set(data.subarray(offset, offset + byteLength), cursor);
          cursor += byteLength;
        }
      };
      function expand2(newCapacity) {
        var prevCapacity = contents.length;
        if (prevCapacity >= newCapacity)
          return;
        var CAPACITY_DOUBLING_MAX = 1024 * 1024;
        newCapacity = Math.max(newCapacity, prevCapacity * (prevCapacity < CAPACITY_DOUBLING_MAX ? 2 : 1.125) >>> 0);
        if (prevCapacity != 0)
          newCapacity = Math.max(newCapacity, 256);
        const oldContents = contents;
        contents = new Uint8Array(newCapacity);
        if (cursor > 0)
          contents.set(oldContents.subarray(0, cursor), 0);
      }
    }
    var BITS = 12;
    var DEFAULT_HSIZE = 5003;
    var MASKS = [
      0,
      1,
      3,
      7,
      15,
      31,
      63,
      127,
      255,
      511,
      1023,
      2047,
      4095,
      8191,
      16383,
      32767,
      65535
    ];
    function lzwEncode(width, height, pixels, colorDepth, outStream = createStream(512), accum = new Uint8Array(256), htab = new Int32Array(DEFAULT_HSIZE), codetab = new Int32Array(DEFAULT_HSIZE)) {
      const hsize = htab.length;
      const initCodeSize = Math.max(2, colorDepth);
      accum.fill(0);
      codetab.fill(0);
      htab.fill(-1);
      let cur_accum = 0;
      let cur_bits = 0;
      const init_bits = initCodeSize + 1;
      const g_init_bits = init_bits;
      let clear_flg = false;
      let n_bits = g_init_bits;
      let maxcode = (1 << n_bits) - 1;
      const ClearCode = 1 << init_bits - 1;
      const EOFCode = ClearCode + 1;
      let free_ent = ClearCode + 2;
      let a_count = 0;
      let ent = pixels[0];
      let hshift = 0;
      for (let fcode = hsize; fcode < 65536; fcode *= 2) {
        ++hshift;
      }
      hshift = 8 - hshift;
      outStream.writeByte(initCodeSize);
      output(ClearCode);
      const length = pixels.length;
      for (let idx = 1; idx < length; idx++) {
        next_block: {
          const c = pixels[idx];
          const fcode = (c << BITS) + ent;
          let i = c << hshift ^ ent;
          if (htab[i] === fcode) {
            ent = codetab[i];
            break next_block;
          }
          const disp = i === 0 ? 1 : hsize - i;
          while (htab[i] >= 0) {
            i -= disp;
            if (i < 0)
              i += hsize;
            if (htab[i] === fcode) {
              ent = codetab[i];
              break next_block;
            }
          }
          output(ent);
          ent = c;
          if (free_ent < 1 << BITS) {
            codetab[i] = free_ent++;
            htab[i] = fcode;
          } else {
            htab.fill(-1);
            free_ent = ClearCode + 2;
            clear_flg = true;
            output(ClearCode);
          }
        }
      }
      output(ent);
      output(EOFCode);
      outStream.writeByte(0);
      return outStream.bytesView();
      function output(code) {
        cur_accum &= MASKS[cur_bits];
        if (cur_bits > 0)
          cur_accum |= code << cur_bits;
        else
          cur_accum = code;
        cur_bits += n_bits;
        while (cur_bits >= 8) {
          accum[a_count++] = cur_accum & 255;
          if (a_count >= 254) {
            outStream.writeByte(a_count);
            outStream.writeBytesView(accum, 0, a_count);
            a_count = 0;
          }
          cur_accum >>= 8;
          cur_bits -= 8;
        }
        if (free_ent > maxcode || clear_flg) {
          if (clear_flg) {
            n_bits = g_init_bits;
            maxcode = (1 << n_bits) - 1;
            clear_flg = false;
          } else {
            ++n_bits;
            maxcode = n_bits === BITS ? 1 << n_bits : (1 << n_bits) - 1;
          }
        }
        if (code == EOFCode) {
          while (cur_bits > 0) {
            accum[a_count++] = cur_accum & 255;
            if (a_count >= 254) {
              outStream.writeByte(a_count);
              outStream.writeBytesView(accum, 0, a_count);
              a_count = 0;
            }
            cur_accum >>= 8;
            cur_bits -= 8;
          }
          if (a_count > 0) {
            outStream.writeByte(a_count);
            outStream.writeBytesView(accum, 0, a_count);
            a_count = 0;
          }
        }
      }
    }
    var lzwEncode_default = lzwEncode;
    function rgb888_to_rgb565(r, g, b) {
      return r << 8 & 63488 | g << 2 & 992 | b >> 3;
    }
    function rgba8888_to_rgba4444(r, g, b, a) {
      return r >> 4 | g & 240 | (b & 240) << 4 | (a & 240) << 8;
    }
    function rgb888_to_rgb444(r, g, b) {
      return r >> 4 << 8 | g & 240 | b >> 4;
    }
    function clamp(value, min, max) {
      return value < min ? min : value > max ? max : value;
    }
    function sqr(value) {
      return value * value;
    }
    function find_nn(bins, idx, hasAlpha) {
      var nn = 0;
      var err = 1e100;
      const bin1 = bins[idx];
      const n1 = bin1.cnt;
      const wa = bin1.ac;
      const wr = bin1.rc;
      const wg = bin1.gc;
      const wb = bin1.bc;
      for (var i = bin1.fw; i != 0; i = bins[i].fw) {
        const bin = bins[i];
        const n2 = bin.cnt;
        const nerr2 = n1 * n2 / (n1 + n2);
        if (nerr2 >= err)
          continue;
        var nerr = 0;
        if (hasAlpha) {
          nerr += nerr2 * sqr(bin.ac - wa);
          if (nerr >= err)
            continue;
        }
        nerr += nerr2 * sqr(bin.rc - wr);
        if (nerr >= err)
          continue;
        nerr += nerr2 * sqr(bin.gc - wg);
        if (nerr >= err)
          continue;
        nerr += nerr2 * sqr(bin.bc - wb);
        if (nerr >= err)
          continue;
        err = nerr;
        nn = i;
      }
      bin1.err = err;
      bin1.nn = nn;
    }
    function create_bin() {
      return {
        ac: 0,
        rc: 0,
        gc: 0,
        bc: 0,
        cnt: 0,
        nn: 0,
        fw: 0,
        bk: 0,
        tm: 0,
        mtm: 0,
        err: 0
      };
    }
    function create_bin_list(data, format) {
      const bincount = format === "rgb444" ? 4096 : 65536;
      const bins = new Array(bincount);
      const size = data.length;
      if (format === "rgba4444") {
        for (let i = 0; i < size; ++i) {
          const color = data[i];
          const a = color >> 24 & 255;
          const b = color >> 16 & 255;
          const g = color >> 8 & 255;
          const r = color & 255;
          const index = rgba8888_to_rgba4444(r, g, b, a);
          let bin = index in bins ? bins[index] : bins[index] = create_bin();
          bin.rc += r;
          bin.gc += g;
          bin.bc += b;
          bin.ac += a;
          bin.cnt++;
        }
      } else if (format === "rgb444") {
        for (let i = 0; i < size; ++i) {
          const color = data[i];
          const b = color >> 16 & 255;
          const g = color >> 8 & 255;
          const r = color & 255;
          const index = rgb888_to_rgb444(r, g, b);
          let bin = index in bins ? bins[index] : bins[index] = create_bin();
          bin.rc += r;
          bin.gc += g;
          bin.bc += b;
          bin.cnt++;
        }
      } else {
        for (let i = 0; i < size; ++i) {
          const color = data[i];
          const b = color >> 16 & 255;
          const g = color >> 8 & 255;
          const r = color & 255;
          const index = rgb888_to_rgb565(r, g, b);
          let bin = index in bins ? bins[index] : bins[index] = create_bin();
          bin.rc += r;
          bin.gc += g;
          bin.bc += b;
          bin.cnt++;
        }
      }
      return bins;
    }
    function quantize2(rgba2, maxColors, opts = {}) {
      const {
        format = "rgb565",
        clearAlpha = true,
        clearAlphaColor = 0,
        clearAlphaThreshold = 0,
        oneBitAlpha = false
      } = opts;
      if (!rgba2 || !rgba2.buffer) {
        throw new Error("quantize() expected RGBA Uint8Array data");
      }
      if (!(rgba2 instanceof Uint8Array) && !(rgba2 instanceof Uint8ClampedArray)) {
        throw new Error("quantize() expected RGBA Uint8Array data");
      }
      const data = new Uint32Array(rgba2.buffer);
      let useSqrt = opts.useSqrt !== false;
      const hasAlpha = format === "rgba4444";
      const bins = create_bin_list(data, format);
      const bincount = bins.length;
      const bincountMinusOne = bincount - 1;
      const heap = new Uint32Array(bincount + 1);
      var maxbins = 0;
      for (var i = 0; i < bincount; ++i) {
        const bin = bins[i];
        if (bin != null) {
          var d = 1 / bin.cnt;
          if (hasAlpha)
            bin.ac *= d;
          bin.rc *= d;
          bin.gc *= d;
          bin.bc *= d;
          bins[maxbins++] = bin;
        }
      }
      if (sqr(maxColors) / maxbins < 0.022) {
        useSqrt = false;
      }
      var i = 0;
      for (; i < maxbins - 1; ++i) {
        bins[i].fw = i + 1;
        bins[i + 1].bk = i;
        if (useSqrt)
          bins[i].cnt = Math.sqrt(bins[i].cnt);
      }
      if (useSqrt)
        bins[i].cnt = Math.sqrt(bins[i].cnt);
      var h, l, l2;
      for (i = 0; i < maxbins; ++i) {
        find_nn(bins, i, false);
        var err = bins[i].err;
        for (l = ++heap[0]; l > 1; l = l2) {
          l2 = l >> 1;
          if (bins[h = heap[l2]].err <= err)
            break;
          heap[l] = h;
        }
        heap[l] = i;
      }
      var extbins = maxbins - maxColors;
      for (i = 0; i < extbins; ) {
        var tb;
        for (; ; ) {
          var b1 = heap[1];
          tb = bins[b1];
          if (tb.tm >= tb.mtm && bins[tb.nn].mtm <= tb.tm)
            break;
          if (tb.mtm == bincountMinusOne)
            b1 = heap[1] = heap[heap[0]--];
          else {
            find_nn(bins, b1, false);
            tb.tm = i;
          }
          var err = bins[b1].err;
          for (l = 1; (l2 = l + l) <= heap[0]; l = l2) {
            if (l2 < heap[0] && bins[heap[l2]].err > bins[heap[l2 + 1]].err)
              l2++;
            if (err <= bins[h = heap[l2]].err)
              break;
            heap[l] = h;
          }
          heap[l] = b1;
        }
        var nb = bins[tb.nn];
        var n1 = tb.cnt;
        var n2 = nb.cnt;
        var d = 1 / (n1 + n2);
        if (hasAlpha)
          tb.ac = d * (n1 * tb.ac + n2 * nb.ac);
        tb.rc = d * (n1 * tb.rc + n2 * nb.rc);
        tb.gc = d * (n1 * tb.gc + n2 * nb.gc);
        tb.bc = d * (n1 * tb.bc + n2 * nb.bc);
        tb.cnt += nb.cnt;
        tb.mtm = ++i;
        bins[nb.bk].fw = nb.fw;
        bins[nb.fw].bk = nb.bk;
        nb.mtm = bincountMinusOne;
      }
      let palette = [];
      var k = 0;
      for (i = 0; ; ++k) {
        let r = clamp(Math.round(bins[i].rc), 0, 255);
        let g = clamp(Math.round(bins[i].gc), 0, 255);
        let b = clamp(Math.round(bins[i].bc), 0, 255);
        let a = 255;
        if (hasAlpha) {
          a = clamp(Math.round(bins[i].ac), 0, 255);
          if (oneBitAlpha) {
            const threshold = typeof oneBitAlpha === "number" ? oneBitAlpha : 127;
            a = a <= threshold ? 0 : 255;
          }
          if (clearAlpha && a <= clearAlphaThreshold) {
            r = g = b = clearAlphaColor;
            a = 0;
          }
        }
        const color = hasAlpha ? [r, g, b, a] : [r, g, b];
        const exists = existsInPalette(palette, color);
        if (!exists)
          palette.push(color);
        if ((i = bins[i].fw) == 0)
          break;
      }
      return palette;
    }
    function existsInPalette(palette, color) {
      for (let i = 0; i < palette.length; i++) {
        const p = palette[i];
        let matchesRGB = p[0] === color[0] && p[1] === color[1] && p[2] === color[2];
        let matchesAlpha = p.length >= 4 && color.length >= 4 ? p[3] === color[3] : true;
        if (matchesRGB && matchesAlpha)
          return true;
      }
      return false;
    }
    function euclideanDistanceSquared(a, b) {
      var sum = 0;
      var n;
      for (n = 0; n < a.length; n++) {
        const dx = a[n] - b[n];
        sum += dx * dx;
      }
      return sum;
    }
    function roundStep(byte, step) {
      return step > 1 ? Math.round(byte / step) * step : byte;
    }
    function prequantize(rgba2, { roundRGB = 5, roundAlpha = 10, oneBitAlpha = null } = {}) {
      const data = new Uint32Array(rgba2.buffer);
      for (let i = 0; i < data.length; i++) {
        const color = data[i];
        let a = color >> 24 & 255;
        let b = color >> 16 & 255;
        let g = color >> 8 & 255;
        let r = color & 255;
        a = roundStep(a, roundAlpha);
        if (oneBitAlpha) {
          const threshold = typeof oneBitAlpha === "number" ? oneBitAlpha : 127;
          a = a <= threshold ? 0 : 255;
        }
        r = roundStep(r, roundRGB);
        g = roundStep(g, roundRGB);
        b = roundStep(b, roundRGB);
        data[i] = a << 24 | b << 16 | g << 8 | r << 0;
      }
    }
    function applyPalette2(rgba2, palette, format = "rgb565") {
      if (!rgba2 || !rgba2.buffer) {
        throw new Error("quantize() expected RGBA Uint8Array data");
      }
      if (!(rgba2 instanceof Uint8Array) && !(rgba2 instanceof Uint8ClampedArray)) {
        throw new Error("quantize() expected RGBA Uint8Array data");
      }
      if (palette.length > 256) {
        throw new Error("applyPalette() only works with 256 colors or less");
      }
      const data = new Uint32Array(rgba2.buffer);
      const length = data.length;
      const bincount = format === "rgb444" ? 4096 : 65536;
      const index = new Uint8Array(length);
      const cache = new Array(bincount);
      const hasAlpha = format === "rgba4444";
      if (format === "rgba4444") {
        for (let i = 0; i < length; i++) {
          const color = data[i];
          const a = color >> 24 & 255;
          const b = color >> 16 & 255;
          const g = color >> 8 & 255;
          const r = color & 255;
          const key = rgba8888_to_rgba4444(r, g, b, a);
          const idx = key in cache ? cache[key] : cache[key] = nearestColorIndexRGBA(r, g, b, a, palette);
          index[i] = idx;
        }
      } else {
        const rgb888_to_key = format === "rgb444" ? rgb888_to_rgb444 : rgb888_to_rgb565;
        for (let i = 0; i < length; i++) {
          const color = data[i];
          const b = color >> 16 & 255;
          const g = color >> 8 & 255;
          const r = color & 255;
          const key = rgb888_to_key(r, g, b);
          const idx = key in cache ? cache[key] : cache[key] = nearestColorIndexRGB(r, g, b, palette);
          index[i] = idx;
        }
      }
      return index;
    }
    function nearestColorIndexRGBA(r, g, b, a, palette) {
      let k = 0;
      let mindist = 1e100;
      for (let i = 0; i < palette.length; i++) {
        const px2 = palette[i];
        const a2 = px2[3];
        let curdist = sqr2(a2 - a);
        if (curdist > mindist)
          continue;
        const r2 = px2[0];
        curdist += sqr2(r2 - r);
        if (curdist > mindist)
          continue;
        const g2 = px2[1];
        curdist += sqr2(g2 - g);
        if (curdist > mindist)
          continue;
        const b2 = px2[2];
        curdist += sqr2(b2 - b);
        if (curdist > mindist)
          continue;
        mindist = curdist;
        k = i;
      }
      return k;
    }
    function nearestColorIndexRGB(r, g, b, palette) {
      let k = 0;
      let mindist = 1e100;
      for (let i = 0; i < palette.length; i++) {
        const px2 = palette[i];
        const r2 = px2[0];
        let curdist = sqr2(r2 - r);
        if (curdist > mindist)
          continue;
        const g2 = px2[1];
        curdist += sqr2(g2 - g);
        if (curdist > mindist)
          continue;
        const b2 = px2[2];
        curdist += sqr2(b2 - b);
        if (curdist > mindist)
          continue;
        mindist = curdist;
        k = i;
      }
      return k;
    }
    function snapColorsToPalette(palette, knownColors, threshold = 5) {
      if (!palette.length || !knownColors.length)
        return;
      const paletteRGB = palette.map((p) => p.slice(0, 3));
      const thresholdSq = threshold * threshold;
      const dim = palette[0].length;
      for (let i = 0; i < knownColors.length; i++) {
        let color = knownColors[i];
        if (color.length < dim) {
          color = [color[0], color[1], color[2], 255];
        } else if (color.length > dim) {
          color = color.slice(0, 3);
        } else {
          color = color.slice();
        }
        const r = nearestColorIndexWithDistance(paletteRGB, color.slice(0, 3), euclideanDistanceSquared);
        const idx = r[0];
        const distanceSq = r[1];
        if (distanceSq > 0 && distanceSq <= thresholdSq) {
          palette[idx] = color;
        }
      }
    }
    function sqr2(a) {
      return a * a;
    }
    function nearestColorIndex(colors, pixel, distanceFn = euclideanDistanceSquared) {
      let minDist = Infinity;
      let minDistIndex = -1;
      for (let j = 0; j < colors.length; j++) {
        const paletteColor = colors[j];
        const dist = distanceFn(pixel, paletteColor);
        if (dist < minDist) {
          minDist = dist;
          minDistIndex = j;
        }
      }
      return minDistIndex;
    }
    function nearestColorIndexWithDistance(colors, pixel, distanceFn = euclideanDistanceSquared) {
      let minDist = Infinity;
      let minDistIndex = -1;
      for (let j = 0; j < colors.length; j++) {
        const paletteColor = colors[j];
        const dist = distanceFn(pixel, paletteColor);
        if (dist < minDist) {
          minDist = dist;
          minDistIndex = j;
        }
      }
      return [minDistIndex, minDist];
    }
    function nearestColor(colors, pixel, distanceFn = euclideanDistanceSquared) {
      return colors[nearestColorIndex(colors, pixel, distanceFn)];
    }
    function GIFEncoder2(opt = {}) {
      const { initialCapacity = 4096, auto = true } = opt;
      const stream = createStream(initialCapacity);
      const HSIZE = 5003;
      const accum = new Uint8Array(256);
      const htab = new Int32Array(HSIZE);
      const codetab = new Int32Array(HSIZE);
      let hasInit = false;
      return {
        reset() {
          stream.reset();
          hasInit = false;
        },
        finish() {
          stream.writeByte(constants_default.trailer);
        },
        bytes() {
          return stream.bytes();
        },
        bytesView() {
          return stream.bytesView();
        },
        get buffer() {
          return stream.buffer;
        },
        get stream() {
          return stream;
        },
        writeHeader,
        writeFrame(index, width, height, opts = {}) {
          const {
            transparent = false,
            transparentIndex = 0,
            delay = 0,
            palette = null,
            repeat = 0,
            colorDepth = 8,
            dispose = -1
          } = opts;
          let first = false;
          if (auto) {
            if (!hasInit) {
              first = true;
              writeHeader();
              hasInit = true;
            }
          } else {
            first = Boolean(opts.first);
          }
          width = Math.max(0, Math.floor(width));
          height = Math.max(0, Math.floor(height));
          if (first) {
            if (!palette) {
              throw new Error("First frame must include a { palette } option");
            }
            encodeLogicalScreenDescriptor(stream, width, height, palette, colorDepth);
            encodeColorTable(stream, palette);
            if (repeat >= 0) {
              encodeNetscapeExt(stream, repeat);
            }
          }
          const delayTime = Math.round(delay / 10);
          encodeGraphicControlExt(stream, dispose, delayTime, transparent, transparentIndex);
          const useLocalColorTable = Boolean(palette) && !first;
          encodeImageDescriptor(stream, width, height, useLocalColorTable ? palette : null);
          if (useLocalColorTable)
            encodeColorTable(stream, palette);
          encodePixels(stream, index, width, height, colorDepth, accum, htab, codetab);
        }
      };
      function writeHeader() {
        writeUTFBytes(stream, "GIF89a");
      }
    }
    function encodeGraphicControlExt(stream, dispose, delay, transparent, transparentIndex) {
      stream.writeByte(33);
      stream.writeByte(249);
      stream.writeByte(4);
      if (transparentIndex < 0) {
        transparentIndex = 0;
        transparent = false;
      }
      var transp, disp;
      if (!transparent) {
        transp = 0;
        disp = 0;
      } else {
        transp = 1;
        disp = 2;
      }
      if (dispose >= 0) {
        disp = dispose & 7;
      }
      disp <<= 2;
      const userInput = 0;
      stream.writeByte(0 | disp | userInput | transp);
      writeUInt16(stream, delay);
      stream.writeByte(transparentIndex || 0);
      stream.writeByte(0);
    }
    function encodeLogicalScreenDescriptor(stream, width, height, palette, colorDepth = 8) {
      const globalColorTableFlag = 1;
      const sortFlag = 0;
      const globalColorTableSize = colorTableSize(palette.length) - 1;
      const fields = globalColorTableFlag << 7 | colorDepth - 1 << 4 | sortFlag << 3 | globalColorTableSize;
      const backgroundColorIndex = 0;
      const pixelAspectRatio = 0;
      writeUInt16(stream, width);
      writeUInt16(stream, height);
      stream.writeBytes([fields, backgroundColorIndex, pixelAspectRatio]);
    }
    function encodeNetscapeExt(stream, repeat) {
      stream.writeByte(33);
      stream.writeByte(255);
      stream.writeByte(11);
      writeUTFBytes(stream, "NETSCAPE2.0");
      stream.writeByte(3);
      stream.writeByte(1);
      writeUInt16(stream, repeat);
      stream.writeByte(0);
    }
    function encodeColorTable(stream, palette) {
      const colorTableLength = 1 << colorTableSize(palette.length);
      for (let i = 0; i < colorTableLength; i++) {
        let color = [0, 0, 0];
        if (i < palette.length) {
          color = palette[i];
        }
        stream.writeByte(color[0]);
        stream.writeByte(color[1]);
        stream.writeByte(color[2]);
      }
    }
    function encodeImageDescriptor(stream, width, height, localPalette) {
      stream.writeByte(44);
      writeUInt16(stream, 0);
      writeUInt16(stream, 0);
      writeUInt16(stream, width);
      writeUInt16(stream, height);
      if (localPalette) {
        const interlace = 0;
        const sorted = 0;
        const palSize = colorTableSize(localPalette.length) - 1;
        stream.writeByte(128 | interlace | sorted | 0 | palSize);
      } else {
        stream.writeByte(0);
      }
    }
    function encodePixels(stream, index, width, height, colorDepth = 8, accum, htab, codetab) {
      lzwEncode_default(width, height, index, colorDepth, stream, accum, htab, codetab);
    }
    function writeUInt16(stream, short) {
      stream.writeByte(short & 255);
      stream.writeByte(short >> 8 & 255);
    }
    function writeUTFBytes(stream, text) {
      for (var i = 0; i < text.length; i++) {
        stream.writeByte(text.charCodeAt(i));
      }
    }
    function colorTableSize(length) {
      return Math.max(Math.ceil(Math.log2(length)), 1);
    }
    var src_default = GIFEncoder2;
  }
});

// src/raster.ts
var raster_exports = {};
__export(raster_exports, {
  gif: () => gif,
  mp4: () => mp4,
  sheet: () => sheet,
  stillPng: () => stillPng
});
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
function fonts() {
  if (fontsReady) return;
  fontsReady = true;
  const here = dirname(fileURLToPath(import.meta.url));
  for (const dir of [join(here, "..", "fonts"), join(here, "fonts"), join(here, "..", "..", "fonts")]) {
    const f = join(dir, "Fraunces_400Regular.ttf");
    if (existsSync(f)) {
      GlobalFonts.registerFromPath(f, TEXT_FONT);
      return;
    }
  }
}
function stillPng(it, t, px) {
  fonts();
  const canvas = createCanvas(px, px);
  const ctx = canvas.getContext("2d");
  drawFrame(ctx, it.frame(t).ops, px);
  return canvas.toBuffer("image/png");
}
function* frames(it, o) {
  fonts();
  const canvas = createCanvas(o.px, o.px);
  const ctx = canvas.getContext("2d");
  const total = Math.round(o.seconds * o.fps);
  for (let i = 0; i < total; i++) {
    drawFrame(ctx, it.frame(i / o.fps).ops, o.px);
    yield ctx.getImageData(0, 0, o.px, o.px).data;
    o.onFrame?.(i + 1, total);
  }
}
function gif(it, o) {
  const enc = (0, import_gifenc.GIFEncoder)();
  const delay = Math.round(1e3 / o.fps);
  for (const rgba2 of frames(it, o)) {
    const palette = (0, import_gifenc.quantize)(rgba2, 256);
    const index = (0, import_gifenc.applyPalette)(rgba2, palette);
    enc.writeFrame(index, o.px, o.px, { palette, delay });
  }
  enc.finish();
  return Buffer.from(enc.bytes());
}
async function mp4(it, o) {
  const mod = await import("h264-mp4-encoder");
  const HME = mod.default ?? mod;
  const enc = await HME.createH264MP4Encoder();
  enc.width = o.px;
  enc.height = o.px;
  enc.frameRate = o.fps;
  enc.quantizationParameter = 16;
  enc.initialize();
  for (const rgba2 of frames(it, o)) enc.addFrameRgba(new Uint8Array(rgba2.buffer, rgba2.byteOffset, rgba2.byteLength));
  enc.finalize();
  const out = Buffer.from(enc.FS.readFile(enc.outputFilename));
  enc.delete();
  return out;
}
function sheet(items, t, cols, cell) {
  fonts();
  const pad = 16;
  const label = 28;
  const rows = Math.ceil(items.length / cols);
  const w = cols * (cell + pad) + pad;
  const h = rows * (cell + pad + label) + pad;
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#f3eee4";
  ctx.fillRect(0, 0, w, h);
  const thumb = createCanvas(cell, cell);
  const tctx = thumb.getContext("2d");
  items.forEach((item, k) => {
    const x = pad + k % cols * (cell + pad);
    const y = pad + Math.floor(k / cols) * (cell + pad + label);
    try {
      drawFrame(tctx, item.it.frame(t).ops, cell);
    } catch (e) {
      tctx.setTransform(1, 0, 0, 1, 0, 0);
      tctx.fillStyle = "#e6dcc8";
      tctx.fillRect(0, 0, cell, cell);
      tctx.fillStyle = "#a8432a";
      tctx.font = "14px sans-serif";
      tctx.fillText(String(e.message).slice(0, 40), 8, cell / 2);
    }
    ctx.drawImage(thumb, x, y);
    ctx.fillStyle = "#15130f";
    ctx.font = `16px "${TEXT_FONT}", serif`;
    ctx.fillText(item.label, x, y + cell + 20);
  });
  return canvas.toBuffer("image/png");
}
var import_gifenc, fontsReady;
var init_raster = __esm({
  "src/raster.ts"() {
    import_gifenc = __toESM(require_gifenc(), 1);
    init_src();
    fontsReady = false;
  }
});

// src/cli.ts
init_src();
import { readFileSync, writeFileSync, existsSync as existsSync2, mkdirSync, statSync, readdirSync } from "node:fs";
import { basename, dirname as dirname2, extname, join as join2, resolve } from "node:path";
import { createInterface } from "node:readline";
import { deflateRawSync } from "node:zlib";
var VERSION = true ? "0.1.0" : "0.0.0-dev";
var HELP = `squiggle ${VERSION}: code you can post

usage
  squiggle render <piece.sqg>\u2026 [--out file] [--t 1] [--size 1024]
  squiggle render <piece.sqg> --seconds 6 [--out clip.mp4|clip.gif] [--fps 30]
  squiggle shell                  try values and make blocks line by line
  squiggle tidy <piece.sqg> [-w]  lay the code out the standard way (-w writes the file)
  squiggle squeeze <piece.sqg> [-w]
                                  shorten it without changing the art, print the count
  squiggle check <piece.sqg>\u2026     run each piece and report problems
  squiggle link <piece.sqg>       print a studio link with the code inside
  squiggle examples [dir]         list the starter pieces, or write them all to dir
  squiggle sheet <piece.sqg>\u2026 --out sheet.png
                                  a contact sheet of many pieces

A starter name works anywhere a file does:  squiggle render tide --out tide.png
More: ${SITE_URL}/reference`;
function parseArgs(argv) {
  const out = { _: [] };
  const short = { o: "out", w: "write", h: "help", v: "version", s: "seconds" };
  for (let k = 0; k < argv.length; k++) {
    const a = argv[k];
    if (a.startsWith("--")) {
      const [name, value] = a.slice(2).split("=", 2);
      if (value !== void 0) out[name] = value;
      else if (["write", "help", "version", "check", "quiet"].includes(name)) out[name] = true;
      else out[name] = argv[++k] ?? "";
    } else if (/^-[a-z]$/.test(a)) {
      const name = short[a[1]] ?? a[1];
      if (["write", "help", "version"].includes(name)) out[name] = true;
      else out[name] = argv[++k] ?? "";
    } else out._.push(a);
  }
  return out;
}
var Exit = class extends Error {
  code;
  constructor(code) {
    super(`exit ${code}`);
    this.code = code;
  }
};
function fail(message) {
  console.error(`squiggle: ${message}`);
  throw new Exit(1);
}
function num2(flags, name, fallback, min, max) {
  const v = flags[name];
  if (v === void 0) return fallback;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) fail(`--${name} must be a number from ${min} to ${max}`);
  return n;
}
function expand(refs) {
  return refs.flatMap(
    (r) => existsSync2(r) && statSync(r).isDirectory() ? readdirSync(r).filter((f) => f.endsWith(".sqg")).sort().map((f) => join2(r, f)) : [r]
  );
}
function load(ref) {
  if (existsSync2(ref) && statSync(ref).isFile()) {
    return { name: basename(ref, extname(ref)), code: readFileSync(ref, "utf8"), path: ref };
  }
  const slug = basename(ref, ".sqg");
  const ex = EXAMPLES.find((e) => e.slug === slug);
  if (ex) return { name: ex.slug, code: ex.code };
  fail(`can't find ${ref} (not a file, and not a starter; see squiggle examples)`);
}
function compile(name, code) {
  try {
    const it = new Interp(code);
    it.frame(0);
    if (it.animated) it.frame(1);
    return it;
  } catch (e) {
    console.error(`${name}: ${formatError(toErrorInfo(e), code)}`);
    throw new Exit(1);
  }
}
async function render2(flags) {
  const refs = expand(flags._.slice(1));
  if (!refs.length) fail("render needs a piece, like: squiggle render piece.sqg --out piece.png");
  const seconds = flags.seconds !== void 0 ? num2(flags, "seconds", 6, 0.1, 60) : 0;
  const out = typeof flags.out === "string" ? flags.out : void 0;
  if (out && refs.length > 1 && !(existsSync2(out) && statSync(out).isDirectory())) fail("--out with several pieces must be a folder");
  const { stillPng: stillPng2, gif: gif2, mp4: mp42 } = await Promise.resolve().then(() => (init_raster(), raster_exports));
  for (const ref of refs) {
    const piece = load(ref);
    const it = compile(piece.name, piece.code);
    const defaultExt = seconds ? ".mp4" : ".png";
    let target = out ?? (piece.path ? piece.path.replace(/\.sqg$/i, "") + defaultExt : piece.name + defaultExt);
    if (out && existsSync2(out) && statSync(out).isDirectory()) target = join2(out, piece.name + defaultExt);
    mkdirSync(dirname2(resolve(target)), { recursive: true });
    const ext = extname(target).toLowerCase();
    const started = Date.now();
    try {
      if (seconds) {
        if (ext !== ".mp4" && ext !== ".gif") fail("clips are .mp4 or .gif");
        const fps = num2(flags, "fps", ext === ".gif" ? 20 : 30, 1, 60);
        const px = num2(flags, "size", 512, 16, 2048);
        const progress = (done, total) => {
          if (process.stderr.isTTY && !flags.quiet) process.stderr.write(`\r${piece.name}: frame ${done}/${total}`);
        };
        const data = ext === ".gif" ? gif2(it, { seconds, fps, px, onFrame: progress }) : await mp42(it, { seconds, fps, px: px - px % 2, onFrame: progress });
        if (process.stderr.isTTY && !flags.quiet) process.stderr.write("\r");
        writeFileSync(target, data);
      } else {
        if (ext !== ".png") fail("stills are .png (add --seconds 6 for a clip)");
        const t = num2(flags, "t", it.animated ? 1 : 0, 0, 3600);
        const px = num2(flags, "size", 1024, 16, 4096);
        writeFileSync(target, stillPng2(it, t, px));
      }
    } catch (e) {
      if (e instanceof Exit) throw e;
      console.error(`${piece.name}: ${formatError(toErrorInfo(e), piece.code)}`);
      throw new Exit(1);
    }
    if (!flags.quiet) console.log(`${target}  (${((Date.now() - started) / 1e3).toFixed(1)} s)`);
  }
}
function check(flags) {
  const refs = expand(flags._.slice(1));
  if (!refs.length) fail("check needs at least one piece");
  let bad = 0;
  for (const ref of refs) {
    const piece = load(ref);
    try {
      const it = new Interp(piece.code);
      const warnings = /* @__PURE__ */ new Set();
      let steps = 0;
      let shapes = 0;
      for (const t of it.animated ? [0, 0.5, 1, 2, 3] : [0]) {
        const f = it.frame(t);
        steps = Math.max(steps, f.steps);
        shapes = Math.max(shapes, f.ops.length);
        for (const w of f.warnings) warnings.add(`line ${w.line}: ${w.message}`);
      }
      const n = postLength(piece.code);
      const cost = it.animated ? ` \xB7 ${steps.toLocaleString("en-US")} steps/frame` : "";
      console.log(`ok  ${piece.name}  ${n} chars${n <= POST_LIMIT ? " \xB7 fits in a post" : " \xB7 TOO LONG FOR A POST"}${it.animated ? " \xB7 moves" : " \xB7 still"}${it.interactive ? " \xB7 interactive" : ""} \xB7 ${shapes} shapes${cost}`);
      for (const w of warnings) console.log(`    note: ${w}`);
    } catch (e) {
      bad++;
      console.log(`err ${piece.name}
${formatError(toErrorInfo(e), piece.code).replace(/^/gm, "    ")}`);
    }
  }
  if (bad) throw new Exit(1);
}
function tidyCmd(flags) {
  const piece = load(flags._[1] ?? fail("tidy needs a piece"));
  let out;
  try {
    out = tidy(piece.code);
  } catch (e) {
    console.error(formatError(toErrorInfo(e), piece.code));
    throw new Exit(1);
  }
  if (flags.write) {
    if (!piece.path) fail("-w needs a file");
    writeFileSync(piece.path, out);
    console.log(`tidied ${piece.path}`);
  } else process.stdout.write(out);
}
function squeezeCmd(flags) {
  const piece = load(flags._[1] ?? fail("squeeze needs a piece"));
  let r;
  try {
    r = squeeze(piece.code);
  } catch (e) {
    console.error(formatError(toErrorInfo(e), piece.code));
    throw new Exit(1);
  }
  if (flags.write) {
    if (!piece.path) fail("-w needs a file");
    writeFileSync(piece.path, r.code + "\n");
  } else console.log(r.code);
  const fits = r.after <= POST_LIMIT ? "fits in a post" : `${r.after - POST_LIMIT} over a post`;
  console.error(`
${r.before} \u2192 ${r.after} chars \xB7 ${fits} \xB7 same art, checked frame by frame`);
}
function linkCmd(flags) {
  const piece = load(flags._[1] ?? fail("link needs a piece"));
  const payload = deflateRawSync(Buffer.from(piece.code, "utf8"), { level: 9 }).toString("base64url");
  const base = typeof flags.site === "string" ? flags.site : SITE_URL;
  console.log(`${base.replace(/\/$/, "")}/studio?c=${payload}`);
}
function examplesCmd(flags) {
  const dir = flags._[1];
  if (!dir) {
    for (const e of EXAMPLES) console.log(`${e.slug.padEnd(18)} ${String(postLength(e.code)).padStart(3)} chars`);
    return;
  }
  mkdirSync(dir, { recursive: true });
  for (const e of EXAMPLES) writeFileSync(join2(dir, `${e.slug}.sqg`), e.code);
  console.log(`wrote ${EXAMPLES.length} pieces to ${dir}`);
}
async function sheetCmd(flags) {
  let refs = expand(flags._.slice(1));
  if (!refs.length) refs = EXAMPLES.map((e) => e.slug);
  const out = typeof flags.out === "string" ? flags.out : "sheet.png";
  const { sheet: sheet2 } = await Promise.resolve().then(() => (init_raster(), raster_exports));
  const items = refs.map((r) => {
    const p = load(r);
    try {
      return { label: p.name, it: new Interp(p.code) };
    } catch (e) {
      console.error(`${p.name}: ${formatError(toErrorInfo(e), p.code)}`);
      return { label: `${p.name} (error)`, it: new Interp("paper bone") };
    }
  });
  writeFileSync(out, sheet2(items, num2(flags, "t", 1, 0, 3600), num2(flags, "cols", 6, 1, 20), num2(flags, "cell", 240, 32, 1024)));
  console.log(out);
}
function shell() {
  const sh = new Shell();
  const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: "sqg> " });
  console.log(`squiggle ${VERSION} shell. Values print as you go; blocks end with an empty line. .exit to leave.`);
  let buf = [];
  let depth = 0;
  const opens = (line) => {
    const w = line.trim().split(/\s+/)[0];
    return BLOCK_WORDS.includes(w);
  };
  const flush = () => {
    const chunk = buf.join("\n");
    buf = [];
    depth = 0;
    if (!chunk.trim()) return;
    try {
      const r = sh.run(chunk);
      for (const l of r.logs) console.log(l);
      if (r.text) console.log(r.text);
    } catch (e) {
      console.log(formatError(toErrorInfo(e), chunk));
    }
  };
  rl.prompt();
  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (!buf.length && (trimmed === ".exit" || trimmed === "exit")) return rl.close();
    if (!buf.length && trimmed === ".help") {
      console.log("Type a value (2 + 3, hue(30), [1, 2]) to see it, or store one (x = 4).\nStart a block (make, repeat, if\u2026), indent its lines, then an empty line runs it.");
      rl.prompt();
      return;
    }
    const brackets = (line.match(/[([]/g)?.length ?? 0) - (line.match(/[)\]]/g)?.length ?? 0);
    if (buf.length && trimmed === "" && depth <= 0) flush();
    else {
      buf.push(line);
      depth += brackets;
      if (!opens(line) && !/^\s/.test(line) && buf.length === 1 && depth <= 0) flush();
    }
    rl.setPrompt(buf.length ? "...  " : "sqg> ");
    rl.prompt();
  });
  return new Promise((done) => rl.on("close", () => {
    if (buf.length) flush();
    done();
  }));
}
async function main(argv) {
  const flags = parseArgs(argv);
  const cmd = flags._[0];
  try {
    if (flags.version) {
      console.log(VERSION);
      return 0;
    }
    if (!cmd || flags.help || cmd === "help") {
      console.log(HELP);
      return 0;
    }
    switch (cmd) {
      case "render":
        await render2(flags);
        break;
      case "check":
        check(flags);
        break;
      case "tidy":
        tidyCmd(flags);
        break;
      case "squeeze":
        squeezeCmd(flags);
        break;
      case "link":
        linkCmd(flags);
        break;
      case "examples":
        examplesCmd(flags);
        break;
      case "sheet":
        await sheetCmd(flags);
        break;
      case "shell":
        await shell();
        break;
      default:
        if (existsSync2(cmd) && cmd.endsWith(".sqg")) {
          flags._.unshift("render");
          await render2(flags);
          break;
        }
        fail(`unknown command "${cmd}" (try squiggle --help)`);
    }
    return 0;
  } catch (e) {
    if (e instanceof Exit) return e.code;
    throw e;
  }
}
export {
  main
};
