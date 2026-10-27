import { SquiggleError, closest } from './errors.ts';
import { lex, type Token, type Comment } from './lexer.ts';
import {
  COMMAND_NAMES, CONSTANT_NAMES, FUNCTION_NAMES, KEYWORD_NAMES, KEY_NAMES, PALETTE, RESERVED, SYNONYMS,
} from './vocab.ts';

export interface Pos {
  line: number;
  col: number;
  len: number;
}

export type Expr =
  | { t: 'num'; v: number; pos: Pos }
  | { t: 'str'; v: string; pos: Pos }
  | { t: 'color'; hex: string; pos: Pos }
  | { t: 'bool'; v: boolean; pos: Pos }
  | { t: 'name'; name: string; pos: Pos }
  | { t: 'list'; items: Expr[]; pos: Pos }
  | { t: 'point'; x: Expr; y: Expr; pos: Pos }
  | { t: 'bin'; op: string; a: Expr; b: Expr; pos: Pos }
  | { t: 'un'; op: '-' | 'not'; a: Expr; pos: Pos }
  | { t: 'call'; fn: Expr; args: Expr[]; pos: Pos }
  | { t: 'index'; obj: Expr; index: Expr; pos: Pos }
  | { t: 'member'; obj: Expr; name: string; pos: Pos };

export type Stmt =
  | { t: 'cmd'; name: string; args: Expr[]; pos: Pos }
  | { t: 'callstmt'; name: string; args: Expr[]; pos: Pos }
  | { t: 'assign'; name: string; op: string; value: Expr; pos: Pos }
  | { t: 'expr'; expr: Expr; pos: Pos }
  | { t: 'every'; body: Stmt[]; pos: Pos }
  | { t: 'repeat'; count: Expr; as?: string; body: Stmt[]; pos: Pos }
  | { t: 'for'; as: string; list: Expr; body: Stmt[]; pos: Pos }
  | { t: 'if'; cond: Expr; body: Stmt[]; else?: Stmt[]; pos: Pos }
  | { t: 'when'; on: 'key' | 'click'; key?: string; body: Stmt[]; pos: Pos }
  | { t: 'make'; name: string; params: string[]; body: Stmt[]; pos: Pos }
  | { t: 'keep'; body: Stmt[]; pos: Pos };

export interface Program {
  body: Stmt[];
  tokens: Token[];
  comments: Comment[];
}

const EXPR_START_OPS = new Set(['(', '[', '-']);

function posOf(tok: Token, len?: number): Pos {
  return { line: tok.line, col: tok.col, len: len ?? Math.max(1, tok.text.length) };
}

function span(a: Pos, b: Pos): Pos {
  if (a.line !== b.line) return a;
  return { line: a.line, col: a.col, len: Math.max(1, b.col + b.len - a.col) };
}

function unknownCommandHint(name: string, fns: Set<string>): string {
  const syn = SYNONYMS[name.toLowerCase()];
  if (syn) return `Squiggle calls that ${syn}`;
  const guess = closest(name, [...COMMAND_NAMES, ...fns, 'repeat', 'every', 'keep', 'make']);
  if (guess) return `did you mean ${guess}?`;
  return 'shapes are dot, ring, box, line, path, shape and write; make your own with make';
}

export function parse(source: string, knownFns?: Iterable<string>): Program {
  const { tokens, comments } = lex(source);
  // Functions can be used before the line that makes them, so collect their names first.
  const fns = new Set<string>(knownFns ?? []);
  for (let k = 0; k < tokens.length - 1; k++) {
    const prev = tokens[k - 1];
    if (tokens[k].type === 'name' && tokens[k].text === 'make' && (!prev || prev.type === 'newline' || prev.type === 'indent' || prev.type === 'dedent')) {
      const n = tokens[k + 1];
      if (n.type === 'name') fns.add(n.text);
    }
  }
  const p = new Parser(tokens, fns);
  const body = p.program();
  return { body, tokens, comments };
}

class Parser {
  private i = 0;
  private depth = 0; // nesting of blocks
  private inMake = false;
  private inWhen = false;
  private inEvery = false;

  private toks: Token[];
  private fns: Set<string>;

  constructor(toks: Token[], fns: Set<string>) {
    this.toks = toks;
    this.fns = fns;
  }

  private get tok(): Token {
    return this.toks[this.i];
  }
  private peek(n = 1): Token {
    return this.toks[Math.min(this.i + n, this.toks.length - 1)];
  }
  private next(): Token {
    return this.toks[this.i++];
  }
  private isOp(text: string, tok = this.tok): boolean {
    return tok.type === 'op' && tok.text === text;
  }
  private isWord(text: string, tok = this.tok): boolean {
    return tok.type === 'name' && tok.text === text;
  }
  private fail(tok: Token, message: string, hint?: string, len?: number): never {
    if (tok.type === 'newline' || tok.type === 'eof') {
      throw new SquiggleError('syntax', message, { line: tok.line, col: Math.max(1, tok.col), len: 1 }, hint);
    }
    throw new SquiggleError('syntax', message, posOf(tok, len), hint);
  }

  private describe(tok: Token): string {
    switch (tok.type) {
      case 'newline': return 'the end of the line';
      case 'eof': return 'the end of the piece';
      case 'indent': return 'an indent';
      case 'dedent': return 'the end of a block';
      case 'str': return 'text';
      case 'num': return `the number ${tok.text}`;
      case 'color': return `the color ${tok.text}`;
      default: return `"${tok.text}"`;
    }
  }

  private expectOp(text: string, hint?: string): Token {
    if (!this.isOp(text)) this.fail(this.tok, `expected "${text}" but found ${this.describe(this.tok)}`, hint);
    return this.next();
  }

  private endOfLine(what: string): void {
    const tok = this.tok;
    if (tok.type === 'newline') {
      this.next();
      return;
    }
    if (tok.type === 'eof' || tok.type === 'dedent') return;
    if (this.isOp('=')) this.fail(tok, 'a single = stores a value; it only goes right after a name at the start of a line', 'use == to check whether two things are equal');
    this.fail(tok, `didn't expect ${this.describe(tok)} after ${what}`, 'each command goes on its own line; separate values with commas');
  }

  program(): Stmt[] {
    const out: Stmt[] = [];
    while (this.tok.type !== 'eof') {
      if (this.tok.type === 'newline') {
        this.next();
        continue;
      }
      out.push(this.statement());
    }
    return out;
  }

  private block(header: Token, what: string): Stmt[] {
    if (this.tok.type !== 'newline') {
      if (this.tok.type === 'eof') {
        this.fail(header, `${what} needs lines under it`, `put the lines it should run on the next lines, indented by two spaces`);
      }
      this.fail(this.tok, `didn't expect ${this.describe(this.tok)} after ${what}`, `end the line after ${what} and indent the lines it runs`);
    }
    this.next();
    if (this.tok.type !== 'indent') {
      this.fail(header, `${what} needs lines under it, indented`, `indent the lines that belong to ${what} by two spaces`, header.text.length);
    }
    this.next();
    this.depth++;
    const body: Stmt[] = [];
    while (this.tok.type !== 'dedent' && this.tok.type !== 'eof') {
      if (this.tok.type === 'newline') {
        this.next();
        continue;
      }
      body.push(this.statement());
    }
    if (this.tok.type === 'dedent') this.next();
    this.depth--;
    return body;
  }

  private statement(): Stmt {
    const tok = this.tok;
    if (tok.type === 'indent') {
      this.fail(tok, "this line is indented, but the line above doesn't start a block", 'remove the indent, or start a block above it with repeat, if, keep, every frame…', 2);
    }
    if (tok.type === 'name') {
      switch (tok.text) {
        case 'every': return this.every();
        case 'repeat': return this.repeat();
        case 'for': return this.forStmt();
        case 'if': return this.ifStmt();
        case 'else': this.fail(tok, 'this else has no if right above it', 'put else at the same indent as its if, right after the if block');
        // falls through (fail never returns)
        case 'when': return this.when();
        case 'make': return this.make();
        case 'keep': return this.keep();
        case 'frame': this.fail(tok, 'frame on its own does nothing', 'write every frame to start an animation block');
      }
      const after = this.peek();
      if (after.type === 'op' && ['=', '+=', '-=', '*=', '/='].includes(after.text)) return this.assign();
      if (COMMAND_NAMES.has(tok.text)) return this.command();
      if (this.fns.has(tok.text) && this.looksLikeCommandCall()) return this.callStmt();
      if (FUNCTION_NAMES.has(tok.text) && this.startsArgs(after) && !this.isOp('(', after)) {
        this.fail(tok, `${tok.text} gives back a value, so it goes inside a line, not at the start`, `use it like dot ${tok.text}(…), 0, 10`);
      }
      if (!KEYWORD_NAMES.has(tok.text) && this.startsArgs(after) && !FUNCTION_NAMES.has(tok.text) && !CONSTANT_NAMES.has(tok.text)) {
        this.fail(tok, `I don't know a command called "${tok.text}"`, unknownCommandHint(tok.text, this.fns));
      }
    }
    const expr = this.expr();
    const stmt: Stmt = { t: 'expr', expr, pos: expr.pos };
    this.endOfLine('this value');
    return stmt;
  }

  /** after a statement-leading name, does this token start an argument list? */
  private startsArgs(tok: Token): boolean {
    if (tok.type === 'num' || tok.type === 'str' || tok.type === 'color') return true;
    if (tok.type === 'name') return !['and', 'or', 'as', 'in'].includes(tok.text);
    if (tok.type === 'op' && tok.text === '[' && tok.space) return true;
    if (tok.type === 'op' && tok.text === '(' && tok.space) return true;
    if (tok.type === 'op' && tok.text === '-' && tok.space && !this.peek(2).space) return true;
    return false;
  }

  private looksLikeCommandCall(): boolean {
    const after = this.peek();
    if (after.type === 'newline' || after.type === 'eof' || after.type === 'dedent') return true;
    if (this.isOp('(', after) && !after.space) return this.parenIsWholeLine(this.i + 1);
    return this.startsArgs(after);
  }

  /** true when the ( at index k closes right at the end of the line */
  private parenIsWholeLine(k: number): boolean {
    let depth = 0;
    for (let j = k; j < this.toks.length; j++) {
      const t = this.toks[j];
      if (t.type === 'op' && (t.text === '(' || t.text === '[')) depth++;
      if (t.type === 'op' && (t.text === ')' || t.text === ']')) {
        depth--;
        if (depth === 0) {
          const n = this.toks[j + 1];
          return n.type === 'newline' || n.type === 'eof';
        }
      }
      if (t.type === 'newline' || t.type === 'eof') return false;
    }
    return false;
  }

  private args(): Expr[] {
    const nameTok = this.toks[this.i - 1];
    if (this.isOp('(') && !this.tok.space && this.parenIsWholeLine(this.i)) {
      // dot(1, 2, 3) works too.
      this.next();
      const out: Expr[] = [];
      if (!this.isOp(')')) {
        out.push(this.expr());
        while (this.isOp(',')) {
          this.next();
          out.push(this.expr());
        }
      }
      this.expectOp(')');
      return out;
    }
    const out: Expr[] = [];
    if (this.tok.type === 'newline' || this.tok.type === 'eof' || this.tok.type === 'dedent') return out;
    out.push(this.expr());
    while (this.isOp(',')) {
      this.next();
      if (this.tok.type === 'newline' || this.tok.type === 'eof') {
        this.fail(this.tok, `there's a comma after the last value of ${nameTok.text}`, 'remove the trailing comma, or add the missing value');
      }
      out.push(this.expr());
    }
    return out;
  }

  private command(): Stmt {
    const nameTok = this.next();
    const args = this.args();
    const pos = posOf(nameTok);
    this.endOfLine(nameTok.text);
    return { t: 'cmd', name: nameTok.text, args, pos };
  }

  private callStmt(): Stmt {
    const nameTok = this.next();
    const args = this.args();
    const pos = posOf(nameTok);
    this.endOfLine(nameTok.text);
    return { t: 'callstmt', name: nameTok.text, args, pos };
  }

  private checkName(tok: Token, role: string): string {
    if (tok.type !== 'name') this.fail(tok, `${role} needs a name here, but found ${this.describe(tok)}`, 'names start with a letter, like a, size or petal');
    const name = tok.text;
    if (name === 't') this.fail(tok, 't is the clock, so it can\'t be used as a name', 'pick another name, like k or time2');
    if (KEYWORD_NAMES.has(name)) this.fail(tok, `${name} is a Squiggle word, so it can't be used as a name`, 'pick another name');
    if (COMMAND_NAMES.has(name)) this.fail(tok, `${name} is already a command`, `pick another name, like my${name}`);
    if (FUNCTION_NAMES.has(name) || CONSTANT_NAMES.has(name)) this.fail(tok, `${name} is built in, so it can't be used as a name`, `pick another name, like my${name}`);
    if (name in PALETTE) this.fail(tok, `${name} is a palette color, so it can't be used as a name`, `pick another name, like my${name}`);
    return name;
  }

  private assign(): Stmt {
    const nameTok = this.next();
    const name = this.checkName(nameTok, 'storing a value');
    if (this.fns.has(name)) this.fail(nameTok, `${name} is a command you made, so it can't also hold a value`, 'pick another name for the value');
    const opTok = this.next();
    if (this.tok.type === 'newline' || this.tok.type === 'eof') {
      this.fail(this.tok, `${name} ${opTok.text} needs a value after it`, `for example: ${name} ${opTok.text} 10`);
    }
    const value = this.expr();
    const pos = posOf(nameTok);
    this.endOfLine(`the value of ${name}`);
    return { t: 'assign', name, op: opTok.text, value, pos };
  }

  private every(): Stmt {
    const kw = this.next();
    if (!this.isWord('frame')) this.fail(this.tok, 'every is always followed by frame', 'write every frame');
    const frameTok = this.next();
    if (this.depth > 0) this.fail(kw, 'every frame goes at the top level, not inside another block', 'move it all the way to the left', 11);
    this.inEvery = true;
    const body = this.block(frameTok, 'every frame');
    this.inEvery = false;
    return { t: 'every', body, pos: span(posOf(kw), posOf(frameTok)) };
  }

  private repeat(): Stmt {
    const kw = this.next();
    if (this.tok.type === 'newline' || this.tok.type === 'eof') this.fail(kw, 'repeat needs to know how many times', 'for example: repeat 12 as i', 6);
    const count = this.expr();
    let as: string | undefined;
    if (this.isWord('as')) {
      this.next();
      as = this.checkName(this.next(), 'as');
    }
    const body = this.block(kw, 'repeat');
    return { t: 'repeat', count, as, body, pos: posOf(kw) };
  }

  private forStmt(): Stmt {
    const kw = this.next();
    const as = this.checkName(this.next(), 'for');
    if (!this.isWord('in')) this.fail(this.tok, 'for needs "in" and a list', `for example: for ${as} in [1, 2, 3]`);
    this.next();
    const list = this.expr();
    const body = this.block(kw, 'for');
    return { t: 'for', as, list, body, pos: posOf(kw) };
  }

  private ifStmt(): Stmt {
    const kw = this.next();
    if (this.tok.type === 'newline' || this.tok.type === 'eof') this.fail(kw, 'if needs a test', 'for example: if i % 2 == 0', 2);
    const cond = this.expr();
    if (this.isOp('=')) this.fail(this.tok, 'a single = stores a value', 'use == to check whether two things are equal');
    const body = this.block(kw, 'if');
    let elseBody: Stmt[] | undefined;
    if (this.isWord('else')) {
      const elseTok = this.next();
      if (this.isWord('if')) {
        elseBody = [this.ifStmt()];
      } else {
        elseBody = this.block(elseTok, 'else');
      }
    }
    return { t: 'if', cond, body, else: elseBody, pos: posOf(kw) };
  }

  private when(): Stmt {
    const kw = this.next();
    if (this.depth > 0) this.fail(kw, 'when goes at the top level, not inside another block', 'move it all the way to the left', 4);
    let on: 'key' | 'click';
    let key: string | undefined;
    if (this.isWord('click')) {
      on = 'click';
      this.next();
    } else if (this.isWord('key')) {
      on = 'key';
      this.next();
      const k = this.tok;
      if (k.type !== 'str') this.fail(k, 'when key needs the key in quotes', 'for example: when key "space"');
      this.next();
      key = String(k.value).toLowerCase();
      const aliases: Record<string, string> = { ' ': 'space', return: 'enter', esc: 'escape', arrowleft: 'left', arrowright: 'right', arrowup: 'up', arrowdown: 'down' };
      key = aliases[key] ?? key;
      if (!KEY_NAMES.has(key)) {
        const guess = closest(key, KEY_NAMES);
        this.fail(k, `I don't know the key "${k.value}"`, guess ? `try "${guess}"` : 'keys are "space", "enter", "left", "right", "up", "down", letters and digits');
      }
    } else {
      this.fail(this.tok, 'when is followed by key or click', 'for example: when key "space" or when click');
    }
    this.inWhen = true;
    const body = this.block(kw, `when ${on}`);
    this.inWhen = false;
    return { t: 'when', on, key, body, pos: posOf(kw) };
  }

  private make(): Stmt {
    const kw = this.next();
    if (this.depth > 0 || this.inMake) this.fail(kw, 'make goes at the top level, not inside another block', 'move it all the way to the left', 4);
    const nameTok = this.next();
    const name = this.checkName(nameTok, 'make');
    const params: string[] = [];
    if (this.tok.type === 'name') {
      params.push(this.checkName(this.next(), 'make'));
      while (this.isOp(',')) {
        this.next();
        const pTok = this.next();
        const p = this.checkName(pTok, 'make');
        if (params.includes(p)) this.fail(pTok, `${p} is listed twice`, 'give each input its own name');
        params.push(p);
      }
    } else if (this.isOp('(')) {
      this.fail(this.tok, 'make lists its inputs without brackets', `for example: make ${name} a, b`);
    }
    this.inMake = true;
    const body = this.block(kw, `make ${name}`);
    this.inMake = false;
    return { t: 'make', name, params, body, pos: span(posOf(kw), posOf(nameTok)) };
  }

  private keep(): Stmt {
    const kw = this.next();
    const body = this.block(kw, 'keep');
    return { t: 'keep', body, pos: posOf(kw) };
  }

  // ---- expressions ----

  expr(): Expr {
    return this.or();
  }

  private or(): Expr {
    let a = this.and();
    while (this.isWord('or')) {
      this.next();
      const b = this.and();
      a = { t: 'bin', op: 'or', a, b, pos: span(a.pos, b.pos) };
    }
    return a;
  }

  private and(): Expr {
    let a = this.not();
    while (this.isWord('and')) {
      this.next();
      const b = this.not();
      a = { t: 'bin', op: 'and', a, b, pos: span(a.pos, b.pos) };
    }
    return a;
  }

  private not(): Expr {
    if (this.isWord('not')) {
      const tok = this.next();
      const a = this.not();
      return { t: 'un', op: 'not', a, pos: span(posOf(tok), a.pos) };
    }
    return this.compare();
  }

  private compare(): Expr {
    const a = this.sum();
    const tok = this.tok;
    if (tok.type === 'op' && ['==', '!=', '<', '>', '<=', '>='].includes(tok.text)) {
      this.next();
      const b = this.sum();
      const t2 = this.tok;
      if (t2.type === 'op' && ['==', '!=', '<', '>', '<=', '>='].includes(t2.text)) {
        this.fail(t2, 'compare two things at a time', 'join two tests with and, like a < b and b < c');
      }
      return { t: 'bin', op: tok.text, a, b, pos: span(a.pos, b.pos) };
    }
    return a;
  }

  private sum(): Expr {
    let a = this.product();
    while (this.tok.type === 'op' && (this.tok.text === '+' || this.tok.text === '-')) {
      const op = this.next().text;
      const b = this.product();
      a = { t: 'bin', op, a, b, pos: span(a.pos, b.pos) };
    }
    return a;
  }

  private product(): Expr {
    let a = this.unary();
    while (this.tok.type === 'op' && (this.tok.text === '*' || this.tok.text === '/' || this.tok.text === '%')) {
      const op = this.next().text;
      const b = this.unary();
      a = { t: 'bin', op, a, b, pos: span(a.pos, b.pos) };
    }
    return a;
  }

  private unary(): Expr {
    if (this.isOp('-')) {
      const tok = this.next();
      tok.unary = true;
      const a = this.unary();
      if (a.t === 'num') return { t: 'num', v: -a.v, pos: span(posOf(tok), a.pos) };
      return { t: 'un', op: '-', a, pos: span(posOf(tok), a.pos) };
    }
    return this.power();
  }

  private power(): Expr {
    const a = this.postfix();
    if (this.isOp('^')) {
      this.next();
      const b = this.unary();
      return { t: 'bin', op: '^', a, b, pos: span(a.pos, b.pos) };
    }
    return a;
  }

  private postfix(): Expr {
    let e = this.primary();
    for (;;) {
      if (this.isOp('(')) {
        if (e.t !== 'name' && e.t !== 'member' && e.t !== 'index' && e.t !== 'call') break;
        this.next();
        const args: Expr[] = [];
        if (!this.isOp(')')) {
          args.push(this.expr());
          while (this.isOp(',')) {
            this.next();
            args.push(this.expr());
          }
        }
        const close = this.expectOp(')', 'separate the values inside with commas');
        e = { t: 'call', fn: e, args, pos: span(e.pos, posOf(close)) };
        continue;
      }
      if (this.isOp('[')) {
        this.next();
        const index = this.expr();
        const close = this.expectOp(']');
        e = { t: 'index', obj: e, index, pos: span(e.pos, posOf(close)) };
        continue;
      }
      if (this.isOp('.')) {
        this.next();
        const nameTok = this.tok;
        if (nameTok.type !== 'name') this.fail(nameTok, 'a dot is followed by a name, like p.x', 'points have .x and .y');
        this.next();
        e = { t: 'member', obj: e, name: nameTok.text, pos: span(e.pos, posOf(nameTok)) };
        continue;
      }
      break;
    }
    return e;
  }

  private primary(): Expr {
    const tok = this.tok;
    switch (tok.type) {
      case 'num':
        this.next();
        return { t: 'num', v: tok.value as number, pos: posOf(tok) };
      case 'str':
        this.next();
        return { t: 'str', v: tok.value as string, pos: posOf(tok) };
      case 'color':
        this.next();
        return { t: 'color', hex: tok.value as string, pos: posOf(tok) };
      case 'name': {
        if (tok.text === 'true' || tok.text === 'false') {
          this.next();
          return { t: 'bool', v: tok.text === 'true', pos: posOf(tok) };
        }
        if (KEYWORD_NAMES.has(tok.text)) {
          this.fail(tok, `${tok.text} can't be used inside a value`, tok.text === 'every' || tok.text === 'repeat' || tok.text === 'if' ? `${tok.text} starts its own line` : undefined);
        }
        this.next();
        return { t: 'name', name: tok.text, pos: posOf(tok) };
      }
      case 'op': {
        if (tok.text === '(') {
          this.next();
          const a = this.expr();
          if (this.isOp(',')) {
            this.next();
            const b = this.expr();
            if (this.isOp(',')) this.fail(this.tok, 'points have two values: (x, y)', 'use a list for more values: [a, b, c]');
            const close = this.expectOp(')');
            return { t: 'point', x: a, y: b, pos: span(posOf(tok), posOf(close)) };
          }
          this.expectOp(')');
          return a;
        }
        if (tok.text === '[') {
          this.next();
          const items: Expr[] = [];
          if (!this.isOp(']')) {
            items.push(this.expr());
            while (this.isOp(',')) {
              this.next();
              if (this.isOp(']')) break;
              items.push(this.expr());
            }
          }
          const close = this.expectOp(']', 'separate list items with commas');
          return { t: 'list', items, pos: span(posOf(tok), posOf(close)) };
        }
        break;
      }
    }
    if (tok.type === 'newline' || tok.type === 'eof') this.fail(tok, 'this line stops before its value', 'finish the line with a value');
    if (tok.type === 'indent') this.fail(tok, "this line is indented, but the line above doesn't start a block", 'remove the indent');
    this.fail(tok, `didn't expect ${this.describe(tok)} here`, EXPR_START_OPS.has(tok.text) ? undefined : 'a value is a number, "text", a color, a name, a (point) or a [list]');
  }
}

export function reservedHint(name: string): string | undefined {
  return RESERVED.has(name) ? `${name} is built in` : undefined;
}
