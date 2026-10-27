import { SquiggleError } from './errors.ts';

export type TokenType = 'num' | 'str' | 'color' | 'name' | 'op' | 'newline' | 'indent' | 'dedent' | 'eof';

export interface Token {
  type: TokenType;
  text: string;
  value?: number | string;
  line: number;
  col: number;
  /** offset in the source, used by the formatter and the editor */
  pos: number;
  /** true when whitespace (or a line start) sits right before this token */
  space: boolean;
  /** set by the parser on a minus that negates rather than subtracts */
  unary?: boolean;
}

export interface Comment {
  line: number;
  col: number;
  text: string; // without the leading //
  /** true when the comment has the line to itself */
  own: boolean;
}

export interface LexResult {
  tokens: Token[];
  comments: Comment[];
}

const OPS = ['+=', '-=', '*=', '/=', '==', '!=', '<=', '>=', '+', '-', '*', '/', '%', '^', '=', '<', '>', '(', ')', '[', ']', ',', '.'];

const isDigit = (c: string) => c >= '0' && c <= '9';
const isNameStart = (c: string) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_';
const isNameChar = (c: string) => isNameStart(c) || isDigit(c);
const isHex = (c: string) => /[0-9a-fA-F]/.test(c);
const isBlank = (c: string) => c === ' ' || c === '\t' || c === ' ';

export function lex(source: string): LexResult {
  const src = source.replace(/\r\n?/g, '\n');
  const tokens: Token[] = [];
  const comments: Comment[] = [];
  const indents: string[] = [''];
  let depth = 0; // open ( and [
  const openers: Token[] = [];
  const lines = src.split('\n');
  let offset = 0;

  const push = (t: Token) => tokens.push(t);

  for (let li = 0; li < lines.length; li++) {
    const raw = lines[li];
    const lineNo = li + 1;
    const lineStart = offset;
    offset += raw.length + 1;

    // Indentation (only outside brackets, and only for lines with code on them).
    let i = 0;
    while (i < raw.length && isBlank(raw[i])) i++;
    const rest = raw.slice(i);
    const blank = rest.length === 0 || rest.startsWith('//');
    if (blank) {
      if (rest.startsWith('//')) comments.push({ line: lineNo, col: i + 1, text: rest.slice(2), own: true });
      continue;
    }

    if (depth === 0) {
      const indent = raw.slice(0, i).replace(/ /g, ' ');
      const top = indents[indents.length - 1];
      if (indent !== top) {
        if (indent.startsWith(top)) {
          indents.push(indent);
          push({ type: 'indent', text: '', line: lineNo, col: 1, pos: lineStart, space: true });
        } else if (top.startsWith(indent)) {
          while (indents.length > 1 && indents[indents.length - 1] !== indent && indents[indents.length - 1].startsWith(indent)) {
            indents.pop();
            push({ type: 'dedent', text: '', line: lineNo, col: 1, pos: lineStart, space: true });
          }
          if (indents[indents.length - 1] !== indent) {
            throw new SquiggleError(
              'syntax',
              "this line's indent doesn't line up with any block above it",
              { line: lineNo, col: 1, len: Math.max(1, i) },
              `line it up with the line that starts the block it belongs to`,
            );
          }
        } else {
          throw new SquiggleError(
            'syntax',
            'this indent mixes tabs and spaces',
            { line: lineNo, col: 1, len: Math.max(1, i) },
            'indent with spaces only (two per level is the house style)',
          );
        }
      }
    }

    // Tokens on this line.
    let space = true;
    while (i < raw.length) {
      const c = raw[i];
      const col = i + 1;
      const pos = lineStart + i;
      if (isBlank(c)) {
        i++;
        space = true;
        continue;
      }
      if (c === '/' && raw[i + 1] === '/') {
        comments.push({ line: lineNo, col, text: raw.slice(i + 2), own: false });
        break;
      }
      const base = { line: lineNo, col, pos, space };
      space = false;

      if (isDigit(c) || (c === '.' && isDigit(raw[i + 1] ?? ''))) {
        let j = i;
        while (j < raw.length && isDigit(raw[j])) j++;
        if (raw[j] === '.' && isDigit(raw[j + 1] ?? '')) {
          j++;
          while (j < raw.length && isDigit(raw[j])) j++;
        }
        if (j < raw.length && isNameStart(raw[j])) {
          let k = j;
          while (k < raw.length && isNameChar(raw[k])) k++;
          throw new SquiggleError(
            'syntax',
            `"${raw.slice(i, k)}" starts like a number but has letters stuck to it`,
            { line: lineNo, col, len: k - i },
            `put a space or a * between them, like ${raw.slice(i, j)} * ${raw.slice(j, k)}`,
          );
        }
        const text = raw.slice(i, j);
        push({ ...base, type: 'num', text, value: parseFloat(text) });
        i = j;
        continue;
      }

      if (isNameStart(c)) {
        let j = i;
        while (j < raw.length && isNameChar(raw[j])) j++;
        const text = raw.slice(i, j);
        push({ ...base, type: 'name', text });
        i = j;
        continue;
      }

      if (c === '"') {
        let j = i + 1;
        let value = '';
        let closed = false;
        while (j < raw.length) {
          const d = raw[j];
          if (d === '\\' && j + 1 < raw.length) {
            const e = raw[j + 1];
            value += e === 'n' ? '\n' : e;
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
          throw new SquiggleError('syntax', 'this text never ends', { line: lineNo, col, len: raw.length - i }, 'add a closing " at the end of the text');
        }
        push({ ...base, type: 'str', text: raw.slice(i, j), value });
        i = j;
        continue;
      }

      if (c === '#') {
        let j = i + 1;
        while (j < raw.length && isNameChar(raw[j])) j++;
        const hex = raw.slice(i + 1, j);
        if (![3, 4, 6, 8].includes(hex.length) || ![...hex].every(isHex)) {
          throw new SquiggleError(
            'syntax',
            `"${raw.slice(i, j) || '#'}" isn't a color`,
            { line: lineNo, col, len: Math.max(1, j - i) },
            'write colors as # plus 3 or 6 hex digits, like #e4572e (add 2 more for see-through: #e4572e80)',
          );
        }
        push({ ...base, type: 'color', text: raw.slice(i, j), value: hex.toLowerCase() });
        i = j;
        continue;
      }

      const op = OPS.find((o) => raw.startsWith(o, i));
      if (op) {
        const tok: Token = { ...base, type: 'op', text: op };
        if (op === '(' || op === '[') {
          depth++;
          openers.push(tok);
        } else if (op === ')' || op === ']') {
          const opener = openers.pop();
          if (!opener) {
            throw new SquiggleError('syntax', `there's a ${op} here with nothing to close`, { line: lineNo, col }, 'remove it, or add the matching opening bracket');
          }
          const want = opener.text === '(' ? ')' : ']';
          if (want !== op) {
            throw new SquiggleError(
              'syntax',
              `this ${op} doesn't match the ${opener.text} on line ${opener.line}`,
              { line: lineNo, col },
              `close it with ${want}`,
            );
          }
          depth--;
        }
        push(tok);
        i += op.length;
        continue;
      }

      const hint =
        c === "'" ? 'text goes in double quotes, like "hello"'
        : c === ':' ? "blocks don't need a colon; end the line and indent the next one"
        : c === '{' || c === '}' ? 'Squiggle uses indentation for blocks, not braces'
        : c === ';' ? 'put each command on its own line'
        : c === '&' || c === '|' ? 'use the words and / or'
        : c === '!' ? 'use not, or != for "is not equal"'
        : undefined;
      throw new SquiggleError('syntax', `Squiggle doesn't use "${c}"`, { line: lineNo, col }, hint);
    }

    if (depth === 0) {
      push({ type: 'newline', text: '', line: lineNo, col: raw.length + 1, pos: lineStart + raw.length, space: false });
    }
  }

  if (depth > 0) {
    const opener = openers[openers.length - 1];
    throw new SquiggleError(
      'syntax',
      `this ${opener.text} is never closed`,
      { line: opener.line, col: opener.col },
      `add a ${opener.text === '(' ? ')' : ']'} to close it`,
    );
  }

  const endLine = lines.length;
  const endPos = src.length;
  if (tokens.length && tokens[tokens.length - 1].type !== 'newline') {
    tokens.push({ type: 'newline', text: '', line: endLine, col: 1, pos: endPos, space: false });
  }
  while (indents.length > 1) {
    indents.pop();
    tokens.push({ type: 'dedent', text: '', line: endLine, col: 1, pos: endPos, space: true });
  }
  tokens.push({ type: 'eof', text: '', line: endLine, col: 1, pos: endPos, space: true });
  return { tokens, comments };
}
