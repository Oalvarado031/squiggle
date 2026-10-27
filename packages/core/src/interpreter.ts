import { SquiggleError, closest, type ErrorInfo } from './errors.ts';
import { parse, type Expr, type Program, type Stmt, type Pos } from './parser.ts';
import { PALETTE_COLORS, fade, fromHex, hue, mix, rgba, toCss, colorName, sameColor, type Color } from './color.ts';
import { Rand, noise3 } from './random.ts';
import { IDENTITY, mul, q, snapMat, type Mat, type Op } from './ops.ts';
import { COMMANDS, FUNCTIONS, LIMITS, PALETTE, SYNONYMS, type CommandSpec } from './vocab.ts';

export interface Point {
  kind: 'point';
  x: number;
  y: number;
}
export interface UserFn {
  kind: 'fn';
  name: string;
  params: string[];
  body: Stmt[];
}
export interface NativeFn {
  kind: 'native';
  name: string;
  call: (args: Value[], at: Pos, self: Interp) => Value;
}
export type Value = number | string | boolean | null | Value[] | Point | Color | UserFn | NativeFn;

export interface Warning {
  line: number;
  col: number;
  message: string;
}

export interface Frame {
  ops: Op[];
  steps: number;
  logs: string[];
  warnings: Warning[];
}

export interface Limits {
  frameSteps: number;
  setupSteps: number;
  maxOps: number;
  maxList: number;
  maxText: number;
  maxDepth: number;
  maxPoints: number;
}

const MAX_SOURCE = 20_000;
const DEFAULT_PAPER = toCss(PALETTE_COLORS.paper);

const isPoint = (v: Value): v is Point => typeof v === 'object' && v !== null && !Array.isArray(v) && v.kind === 'point';
const isColor = (v: Value): v is Color => typeof v === 'object' && v !== null && !Array.isArray(v) && v.kind === 'color';
const isFn = (v: Value): v is UserFn | NativeFn => typeof v === 'object' && v !== null && !Array.isArray(v) && (v.kind === 'fn' || v.kind === 'native');
const pt = (x: number, y: number): Point => ({ kind: 'point', x, y });

export function typeName(v: Value): string {
  if (v === null) return 'nothing';
  if (typeof v === 'number') return 'a number';
  if (typeof v === 'string') return 'text';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) return 'a list';
  switch (v.kind) {
    case 'point': return 'a point';
    case 'color': return 'a color';
    default: return `the command ${v.name}`;
  }
}

function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return Number.isNaN(n) ? 'not-a-number' : n > 0 ? 'infinity' : '-infinity';
  const r = Math.round(n * 10000) / 10000;
  return String(r === 0 ? 0 : r);
}

export function show(v: Value, nested = false): string {
  if (v === null) return 'none';
  if (typeof v === 'number') return fmtNum(v);
  if (typeof v === 'string') return nested ? JSON.stringify(v) : v;
  if (typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return `[${v.map((x) => show(x, true)).join(', ')}]`;
  switch (v.kind) {
    case 'point': return `(${fmtNum(v.x)}, ${fmtNum(v.y)})`;
    case 'color': return colorName(v);
    case 'fn': return `make ${v.name}`;
    default: return v.name;
  }
}

function equal(a: Value, b: Value): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => equal(x, b[i]));
  if (isPoint(a) && isPoint(b)) return a.x === b.x && a.y === b.y;
  if (isColor(a) && isColor(b)) return sameColor(a, b);
  return false;
}

export function truthy(v: Value): boolean {
  if (v === null || v === false || v === 0 || v === '') return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'number' && Number.isNaN(v)) return false;
  return true;
}

export class Scope {
  vars = new Map<string, Value>();
  parent: Scope | null;
  block: boolean;

  constructor(parent: Scope | null, block = false) {
    this.parent = parent;
    this.block = block;
  }

  find(name: string): Scope | null {
    let s: Scope | null = this;
    while (s) {
      if (s.vars.has(name)) return s;
      s = s.parent;
    }
    return null;
  }

  /** new names skip loop scopes and land in the enclosing make or the top level */
  home(): Scope {
    let s: Scope = this;
    while (s.block && s.parent) s = s.parent;
    return s;
  }

  clone(): Scope {
    const c = new Scope(this.parent, this.block);
    c.vars = new Map(this.vars);
    return c;
  }
}

interface DrawState {
  m: Mat;
  color: Color;
  width: number;
}

type Mode = 'setup' | 'frame' | 'handler';

class Budget extends Error {
  at: Pos | null;
  constructor(at: Pos | null) {
    super('budget');
    this.at = at;
  }
}

const rt = (message: string, at: Pos, hint?: string) => new SquiggleError('runtime', message, at, hint);

/** Runs a parsed program. One Interp lives as long as the piece is on screen. */
export class Interp {
  readonly program: Program;
  readonly limits: Limits;
  readonly animated: boolean;
  readonly interactive: boolean;

  private globals = new Scope(null);
  private active: Scope;
  private fns = new Map<string, UserFn>();
  private frameBodies: Stmt[][] = [];
  private keyHandlers = new Map<string, Stmt[][]>();
  private clickHandlers: Stmt[][] = [];

  private setupDone = false;
  private setupError: SquiggleError | null = null;
  private setupOps: Op[] = [];
  private setupLogs: string[] = [];
  private setupWarnings: Warning[] = [];
  private setupEnd: DrawState = { m: IDENTITY, color: PALETTE_COLORS.ink, width: 2 };
  private frameSeed: number = 1;

  // Per run.
  private mode: Mode = 'setup';
  private ops: Op[] = [];
  private state: DrawState = { m: IDENTITY, color: PALETTE_COLORS.ink, width: 2 };
  private steps = 0;
  private budget = 0;
  private depth = 0;
  private loopAt: Pos | null = null;
  /** scopes of the lines that called each running make, innermost last */
  private callers: Array<{ fn: string; scope: Scope }> = [];
  private logs: string[] = [];
  private warnings: Warning[] = [];
  private warned = new Set<string>();
  rand = new Rand(1);
  time = 0;
  mouse: Point = pt(0, 0);

  constructor(source: string, limits: Partial<Limits> = {}, knownFns?: Iterable<string>) {
    this.limits = { ...LIMITS, ...limits };
    if (source.length > MAX_SOURCE) {
      throw new SquiggleError('syntax', `this piece is ${source.length.toLocaleString('en-US')} characters; the most Squiggle runs is ${MAX_SOURCE.toLocaleString('en-US')}`, { line: 1, col: 1 }, 'squeeze it down: a post fits 280');
    }
    this.program = parse(source, knownFns);
    this.active = this.globals;
    for (const st of this.program.body) {
      if (st.t === 'make') this.fns.set(st.name, { kind: 'fn', name: st.name, params: st.params, body: st.body });
      if (st.t === 'every') this.frameBodies.push(st.body);
      if (st.t === 'when' && st.on === 'click') this.clickHandlers.push(st.body);
      if (st.t === 'when' && st.on === 'key') {
        const list = this.keyHandlers.get(st.key!) ?? [];
        list.push(st.body);
        this.keyHandlers.set(st.key!, list);
      }
    }
    this.animated = this.frameBodies.length > 0;
    this.interactive = this.clickHandlers.length > 0 || this.keyHandlers.size > 0;
  }

  get keys(): string[] {
    return [...this.keyHandlers.keys()];
  }

  // ---- running ----

  private begin(mode: Mode, budget: number, state: DrawState): void {
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

  private runGuarded(body: Stmt[], what: string): void {
    try {
      this.execBlock(body);
    } catch (e) {
      if (e instanceof Budget) {
        throw new SquiggleError(
          'budget',
          `${what} took more than ${this.budget.toLocaleString('en-US')} steps, so it was stopped`,
          e.at ?? { line: 1, col: 1, len: 1 },
          e.at ? 'this loop runs too many times; try a smaller count' : 'something here runs too long; try smaller numbers',
        );
      }
      if (e instanceof RangeError) {
        throw new SquiggleError('runtime', 'this piece nests too deeply to run', { line: 1, col: 1 }, 'make fewer calls inside calls');
      }
      throw e;
    }
  }

  private ensureSetup(): void {
    if (this.setupDone) {
      if (this.setupError) throw this.setupError;
      return;
    }
    this.setupDone = true;
    this.begin('setup', this.limits.setupSteps, { m: IDENTITY, color: PALETTE_COLORS.ink, width: 2 });
    this.rand.reseed(1);
    this.frameSeed = 1;
    this.time = 0;
    this.active = this.globals;
    try {
      this.runGuarded(this.program.body, 'the lines outside every frame');
    } catch (e) {
      this.setupError = e as SquiggleError;
      throw e;
    }
    this.setupOps = this.ops;
    this.setupEnd = { ...this.state };
    this.setupLogs = this.logs;
    this.setupWarnings = this.warnings;
  }

  /** Draws the frame at time t (seconds). Pure: the same t always gives the same frame. */
  frame(t: number, mouse?: { x: number; y: number }): Frame {
    this.ensureSetup();
    const base: Op = { k: 'paper', c: DEFAULT_PAPER };
    if (!this.animated) {
      return { ops: [base, ...this.setupOps], steps: 0, logs: this.setupLogs, warnings: this.setupWarnings };
    }
    this.begin('frame', this.limits.frameSteps, this.setupEnd);
    this.ops = [...this.setupOps];
    this.time = Number.isFinite(t) ? t : 0;
    if (mouse) this.mouse = pt(q(mouse.x), q(mouse.y));
    this.rand.reseed(this.frameSeed);
    this.active = this.globals.clone();
    try {
      for (const body of this.frameBodies) this.runGuarded(body, 'this frame');
    } finally {
      this.active = this.globals;
    }
    const logs = this.setupLogs.length ? [...this.setupLogs, ...this.logs] : this.logs;
    return { ops: [base, ...this.ops], steps: this.steps, logs, warnings: [...this.setupWarnings, ...this.warnings] };
  }

  /** Runs `when key` blocks; returns false when the piece doesn't listen for that key. */
  press(key: string, t: number): boolean {
    const handlers = this.keyHandlers.get(key.toLowerCase());
    if (!handlers) return false;
    this.ensureSetup();
    for (const body of handlers) this.handle(body, t);
    return true;
  }

  click(x: number, y: number, t: number): boolean {
    this.mouse = pt(q(x), q(y));
    if (!this.clickHandlers.length) return false;
    this.ensureSetup();
    for (const body of this.clickHandlers) this.handle(body, t);
    return true;
  }

  private handle(body: Stmt[], t: number): void {
    this.begin('handler', this.limits.frameSteps, this.setupEnd);
    this.time = t;
    this.rand.reseed(this.frameSeed + 0.5);
    this.active = this.globals;
    this.runGuarded(body, 'this when block');
  }

  /** Runs the lines once, top to bottom, and returns the last value (the shell uses this). */
  evaluate(): { value: Value; logs: string[] } {
    this.begin('setup', this.limits.setupSteps, this.setupEnd);
    this.active = this.globals;
    let value: Value = null;
    try {
      value = this.execBlock(this.program.body);
    } catch (e) {
      if (e instanceof Budget) {
        throw new SquiggleError('budget', `this took more than ${this.budget.toLocaleString('en-US')} steps, so it was stopped`, e.at ?? { line: 1, col: 1 }, 'try a smaller count');
      }
      throw e;
    }
    return { value, logs: this.logs };
  }

  /** Shares the top level with earlier chunks (the shell runs one chunk at a time). */
  attach(shared: ShellState): void {
    for (const [k, v] of this.fns) shared.fns.set(k, v);
    this.fns = shared.fns;
    this.globals = shared.globals;
    this.active = shared.globals;
    this.rand = shared.rand;
  }

  // ---- statements ----

  private tick(): void {
    if (++this.steps > this.budget) throw new Budget(this.loopAt);
  }

  private execBlock(body: Stmt[]): Value {
    let last: Value = null;
    for (const st of body) last = this.exec(st);
    return last;
  }

  private exec(st: Stmt): Value {
    this.tick();
    switch (st.t) {
      case 'expr': return this.eval(st.expr);
      case 'assign': {
        let v = this.eval(st.value);
        const home = this.active.find(st.name);
        if (st.op !== '=') {
          if (!home) throw rt(`${st.name} has no value yet, so ${st.op} has nothing to change`, st.pos, `start with ${st.name} = 0`);
          v = this.binary(st.op[0], home.vars.get(st.name)!, v, st.pos);
        }
        (home ?? this.active.home()).vars.set(st.name, v);
        return null;
      }
      case 'cmd': return this.command(st.name, st.args, st.pos);
      case 'callstmt': {
        const fn = this.fns.get(st.name)!;
        return this.callUser(fn, st.args.map((a) => this.eval(a)), st.pos);
      }
      case 'every':
      case 'when':
      case 'make':
        return null; // registered when the piece was read
      case 'repeat': {
        const n = this.eval(st.count);
        if (typeof n !== 'number' || !Number.isFinite(n)) {
          throw rt(`repeat needs a number of times, but got ${typeName(n)}`, st.count.pos, 'for example: repeat 12 as i');
        }
        const count = Math.floor(n);
        const saved = this.loopAt;
        this.loopAt = st.pos;
        const scope = new Scope(this.active, true);
        const outer = this.active;
        this.active = scope;
        const name = st.as ?? 'i';
        let last: Value = null;
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
      case 'for': {
        const list = this.eval(st.list);
        let items: Value[];
        if (Array.isArray(list)) items = list;
        else if (typeof list === 'string') items = [...list];
        else throw rt(`for needs a list, but got ${typeName(list)}`, st.list.pos, 'for example: for c in [ember, sea, moss]');
        const saved = this.loopAt;
        this.loopAt = st.pos;
        const scope = new Scope(this.active, true);
        const outer = this.active;
        this.active = scope;
        let last: Value = null;
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
      case 'if': {
        if (truthy(this.eval(st.cond))) return this.execBlock(st.body);
        if (st.else) return this.execBlock(st.else);
        return null;
      }
      case 'keep': {
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

  private warn(at: Pos, message: string): void {
    const key = `${at.line}:${message}`;
    if (this.warned.has(key) || this.warnings.length > 50) return;
    this.warned.add(key);
    this.warnings.push({ line: at.line, col: at.col, message });
  }

  private emit(op: Op, at: Pos): void {
    if (this.ops.length >= this.limits.maxOps) {
      throw rt(`this frame drew more than ${this.limits.maxOps.toLocaleString('en-US')} shapes, which is the most one frame can hold`, at, 'draw fewer shapes, or bigger ones');
    }
    this.ops.push(op);
  }

  private drawingAllowed(name: string, at: Pos): void {
    if (this.mode === 'handler') {
      throw rt(`${name} can't draw inside a when block`, at, 'change a value here, and draw it in every frame');
    }
  }

  /** Flattens points into numbers and splits off a trailing color. */
  private numbersAndColor(spec: CommandSpec, args: Expr[], at: Pos): { nums: number[]; color?: Color } {
    const nums: number[] = [];
    let color: Color | undefined;
    for (let k = 0; k < args.length; k++) {
      const v = this.eval(args[k]);
      if (typeof v === 'number') nums.push(v);
      else if (isPoint(v)) nums.push(v.x, v.y);
      else if (isColor(v) && k === args.length - 1 && spec.optional?.includes('color')) color = v;
      else if (isColor(v)) {
        throw rt(`${spec.name} got a color where it expected a number`, args[k].pos, spec.optional?.includes('color') ? `the color goes last: ${spec.usage}` : `set colors with color, then ${spec.usage}`);
      } else {
        const what = spec.numbers[nums.length] ?? 'a number';
        throw rt(`${spec.name} got ${typeName(v)} where it expected a number (${what})`, args[k].pos, spec.usage);
      }
    }
    const want = spec.numbers.length;
    const extra = spec.optional?.filter((o) => o !== 'color').length ?? 0;
    if (nums.length < want || nums.length > want + extra) {
      const list = spec.numbers.join(', ');
      const got = nums.length === 0 ? 'none' : String(nums.length);
      throw rt(
        `${spec.name} needs ${want} number${want === 1 ? '' : 's'}: ${list} (got ${got})`,
        at,
        spec.usage,
      );
    }
    return { nums, color };
  }

  private finite(name: string, nums: number[], at: Pos): boolean {
    for (const n of nums) {
      if (!Number.isFinite(n)) {
        this.warn(at, `skipped a ${name} with a number that isn't finite (a division by zero?)`);
        return false;
      }
    }
    return true;
  }

  private pointList(name: string, args: Expr[], at: Pos): { pts: number[]; color?: Color } {
    const vals = args.map((a) => this.eval(a));
    let color: Color | undefined;
    if (vals.length && isColor(vals[vals.length - 1])) color = vals.pop() as Color;
    let items: Value[] = vals;
    if (vals.length === 1 && Array.isArray(vals[0])) items = vals[0];
    else if (vals.length === 1 && !isPoint(vals[0])) throw rt(`${name} needs a list of points, but got ${typeName(vals[0])}`, at, `${name} [(0, 0), (100, 50), (200, 0)]`);
    const pts: number[] = [];
    for (let k = 0; k < items.length; k++) {
      const v = items[k];
      if (isPoint(v)) pts.push(v.x, v.y);
      else if (typeof v === 'number') pts.push(v);
      else throw rt(`${name} needs points, but item ${k} is ${typeName(v)}`, at, `${name} [(0, 0), (100, 50), (200, 0)]`);
    }
    if (pts.length % 2 === 1) throw rt(`${name} got an odd count of numbers, so the last point has no y`, at, `give it points like (x, y)`);
    if (pts.length / 2 > this.limits.maxPoints) {
      throw rt(`${name} got ${pts.length / 2} points; the most is ${this.limits.maxPoints.toLocaleString('en-US')}`, at, 'use fewer points');
    }
    return { pts, color };
  }

  private command(name: string, args: Expr[], at: Pos): Value {
    const spec = COMMAND_SPECS[name];
    const st = this.state;
    switch (name) {
      case 'dot':
      case 'ring': {
        this.drawingAllowed(name, at);
        const { nums, color } = this.numbersAndColor(spec, args, at);
        if (!this.finite(name, nums, at)) return null;
        // A negative size draws nothing, so shrinking things (size = 1 - t) simply vanish.
        const r = q(nums[2]);
        if (r <= 0) return null;
        const c = toCss(color ?? st.color);
        if (name === 'dot') this.emit({ k: 'dot', m: snapMat(st.m), x: q(nums[0]), y: q(nums[1]), r, c }, at);
        else this.emit({ k: 'ring', m: snapMat(st.m), x: q(nums[0]), y: q(nums[1]), r, c, w: q(st.width) }, at);
        return null;
      }
      case 'box': {
        this.drawingAllowed(name, at);
        const { nums, color } = this.numbersAndColor(spec, args, at);
        if (!this.finite(name, nums, at)) return null;
        this.emit({ k: 'box', m: snapMat(st.m), x: q(nums[0]), y: q(nums[1]), w: q(nums[2]), h: q(nums[3]), c: toCss(color ?? st.color) }, at);
        return null;
      }
      case 'line': {
        this.drawingAllowed(name, at);
        const { nums, color } = this.numbersAndColor(spec, args, at);
        if (!this.finite(name, nums, at)) return null;
        this.emit({ k: 'line', m: snapMat(st.m), x1: q(nums[0]), y1: q(nums[1]), x2: q(nums[2]), y2: q(nums[3]), c: toCss(color ?? st.color), w: q(st.width) }, at);
        return null;
      }
      case 'path':
      case 'shape': {
        this.drawingAllowed(name, at);
        if (!args.length) throw rt(`${name} needs a list of points`, at, spec.usage);
        const { pts, color } = this.pointList(name, args, at);
        if (!this.finite(name, pts, at)) return null;
        if (pts.length < 4) return null;
        const p = pts.map(q);
        const c = toCss(color ?? st.color);
        if (name === 'path') this.emit({ k: 'path', m: snapMat(st.m), p, c, w: q(st.width) }, at);
        else this.emit({ k: 'shape', m: snapMat(st.m), p, c }, at);
        return null;
      }
      case 'write': {
        this.drawingAllowed(name, at);
        if (!args.length) throw rt('write needs some text and where to put it', at, spec.usage);
        const textVal = this.eval(args[0]);
        const s = show(textVal).slice(0, 500);
        const rest = args.slice(1).map((a) => this.eval(a));
        let color: Color | undefined;
        if (rest.length && isColor(rest[rest.length - 1])) color = rest.pop() as Color;
        const nums: number[] = [];
        for (const v of rest) {
          if (typeof v === 'number') nums.push(v);
          else if (isPoint(v)) nums.push(v.x, v.y);
          else throw rt(`write got ${typeName(v)} where it expected a number`, at, spec.usage);
        }
        if (nums.length < 2 || nums.length > 3) throw rt(`write needs the text, then x and y (got ${nums.length} number${nums.length === 1 ? '' : 's'})`, at, spec.usage);
        if (!this.finite(name, nums, at)) return null;
        const size = q(nums[2] ?? 18);
        if (size <= 0 || s === '') return null;
        this.emit({ k: 'text', m: snapMat(st.m), s, x: q(nums[0]), y: q(nums[1]), size, c: toCss(color ?? st.color) }, at);
        return null;
      }
      case 'paper': {
        this.drawingAllowed(name, at);
        const c = this.oneColor(name, args, at);
        this.emit({ k: 'paper', c: toCss(c) }, at);
        return null;
      }
      case 'color': {
        this.state = { ...st, color: this.oneColor(name, args, at) };
        return null;
      }
      case 'width': {
        const { nums } = this.numbersAndColor(spec, args, at);
        if (Number.isFinite(nums[0])) this.state = { ...st, width: Math.max(0, nums[0]) };
        return null;
      }
      case 'move': {
        const { nums } = this.numbersAndColor(spec, args, at);
        if (!this.finite(name, nums, at)) return null;
        this.state = { ...st, m: mul(st.m, [1, 0, 0, 1, nums[0], nums[1]]) };
        return null;
      }
      case 'spin': {
        const { nums } = this.numbersAndColor(spec, args, at);
        if (!this.finite(name, nums, at)) return null;
        const c = Math.cos(nums[0]);
        const s = Math.sin(nums[0]);
        this.state = { ...st, m: mul(st.m, [c, s, -s, c, 0, 0]) };
        return null;
      }
      case 'grow': {
        const { nums } = this.numbersAndColor(spec, args, at);
        if (!this.finite(name, nums, at)) return null;
        this.state = { ...st, m: mul(st.m, [nums[0], 0, 0, nums[1] ?? nums[0], 0, 0]) };
        return null;
      }
      case 'seed': {
        const { nums } = this.numbersAndColor(spec, args, at);
        this.rand.reseed(nums[0]);
        if (this.mode === 'setup') this.frameSeed = nums[0];
        return null;
      }
      case 'say': {
        const line = args.map((a) => show(this.eval(a))).join(' ');
        if (this.logs.length < 200) this.logs.push(line);
        return null;
      }
    }
    throw rt(`unknown command ${name}`, at);
  }

  private oneColor(name: string, args: Expr[], at: Pos): Color {
    if (args.length !== 1) throw rt(`${name} needs one color`, at, `for example: ${name} ember`);
    const v = this.eval(args[0]);
    if (!isColor(v)) {
      throw rt(`${name} needs a color, but got ${typeName(v)}`, args[0].pos, `for example: ${name} ember, ${name} #1d2433 or ${name} hue(200)`);
    }
    return v;
  }

  // ---- expressions ----

  eval(e: Expr): Value {
    this.tick();
    switch (e.t) {
      case 'num': return e.v;
      case 'str': return e.v;
      case 'bool': return e.v;
      case 'color': return fromHex(e.hex);
      case 'name': return this.lookup(e.name, e.pos, false);
      case 'list': {
        if (e.items.length > this.limits.maxList) throw rt('this list is too long', e.pos);
        return e.items.map((x) => this.eval(x));
      }
      case 'point': {
        const x = this.eval(e.x);
        const y = this.eval(e.y);
        if (typeof x !== 'number') throw rt(`a point needs numbers, but x is ${typeName(x)}`, e.x.pos);
        if (typeof y !== 'number') throw rt(`a point needs numbers, but y is ${typeName(y)}`, e.y.pos);
        return pt(x, y);
      }
      case 'un': {
        const a = this.eval(e.a);
        if (e.op === 'not') return !truthy(a);
        if (typeof a === 'number') return -a;
        if (isPoint(a)) return pt(-a.x, -a.y);
        throw rt(`can't put a minus in front of ${typeName(a)}`, e.pos);
      }
      case 'bin': {
        if (e.op === 'and') return truthy(this.eval(e.a)) && truthy(this.eval(e.b));
        if (e.op === 'or') return truthy(this.eval(e.a)) || truthy(this.eval(e.b));
        return this.binary(e.op, this.eval(e.a), this.eval(e.b), e.pos);
      }
      case 'call': {
        const fn = e.fn.t === 'name' ? this.lookup(e.fn.name, e.fn.pos, true) : this.eval(e.fn);
        const args = e.args.map((a) => this.eval(a));
        if (!isFn(fn)) {
          const name = e.fn.t === 'name' ? e.fn.name : 'this';
          throw rt(`${name} is ${typeName(fn)}, not something you can call`, e.fn.pos, typeof fn === 'number' ? `to multiply, write ${name} * (…)` : undefined);
        }
        if (fn.kind === 'native') return fn.call(args, e.pos, this);
        return this.callUser(fn, args, e.pos);
      }
      case 'index': {
        const obj = this.eval(e.obj);
        const idx = this.eval(e.index);
        if (typeof idx !== 'number' || !Number.isFinite(idx)) throw rt(`a list position must be a number, not ${typeName(idx)}`, e.index.pos);
        if (isPoint(obj)) {
          const k = Math.floor(idx);
          if (k === 0) return obj.x;
          if (k === 1) return obj.y;
          throw rt(`points only have positions 0 and 1`, e.index.pos, 'use p.x and p.y');
        }
        if (!Array.isArray(obj) && typeof obj !== 'string') throw rt(`can't take an item from ${typeName(obj)}`, e.obj.pos);
        const n = obj.length;
        let k = Math.floor(idx);
        if (k < 0) k += n;
        if (k < 0 || k >= n) {
          throw rt(
            n === 0 ? 'this list is empty, so it has no items' : `this ${Array.isArray(obj) ? 'list' : 'text'} has ${n} item${n === 1 ? '' : 's'}, numbered 0 to ${n - 1}, so there's no item ${fmtNum(idx)}`,
            e.index.pos,
            n ? 'use % len(…) to wrap around, like list[i % len(list)]' : undefined,
          );
        }
        return obj[k];
      }
      case 'member': {
        const obj = this.eval(e.obj);
        if (isPoint(obj)) {
          if (e.name === 'x') return obj.x;
          if (e.name === 'y') return obj.y;
          throw rt(`points have .x and .y, not .${e.name}`, e.pos);
        }
        if (isColor(obj) && ['r', 'g', 'b', 'a'].includes(e.name)) return obj[e.name as 'r'];
        throw rt(`${typeName(obj)} has no .${e.name}`, e.pos, isColor(obj) ? 'colors have .r, .g, .b and .a' : undefined);
      }
    }
  }

  private lookup(name: string, at: Pos, callee: boolean): Value {
    const scope = this.active.find(name);
    if (scope) return scope.vars.get(name)!;
    switch (name) {
      case 't': return this.time;
      case 'turn': return Math.PI * 2;
      case 'pi': return Math.PI;
      case 'mouse': return this.mouse;
    }
    const fn = this.fns.get(name);
    if (fn) return fn;
    const native = NATIVES[name];
    if (native) {
      // A bare rand is a fresh number, so "dot rand * 100, …" reads naturally.
      if (name === 'rand' && !callee) return this.rand.next();
      return native;
    }
    const color = PALETTE_COLORS[name];
    if (color) return color;
    if (COMMAND_SPECS[name]) throw rt(`${name} is a command, so it goes at the start of a line`, at, COMMAND_SPECS[name].usage);
    const caller = this.callers[this.callers.length - 1];
    if (caller?.scope.find(name)) {
      const fn = this.fns.get(caller.fn);
      const params = [...(fn?.params ?? []), name].join(', ');
      throw rt(`${name} belongs to the lines that called ${caller.fn}, so ${caller.fn} can't see it`, at, `hand it over: make ${caller.fn} ${params}, then ${caller.fn} …, ${name}`);
    }
    const known = [...this.allNames()];
    const guess = closest(name, known);
    const syn = SYNONYMS[name.toLowerCase()];
    throw rt(
      `I don't know "${name}" yet`,
      at,
      syn ? `Squiggle calls that ${syn}` : guess ? `did you mean ${guess}?` : `give it a value first, like ${name} = 10`,
    );
  }

  private *allNames(): Iterable<string> {
    let s: Scope | null = this.active;
    while (s) {
      yield* s.vars.keys();
      s = s.parent;
    }
    yield* this.fns.keys();
    yield* Object.keys(NATIVES);
    yield* Object.keys(PALETTE);
    yield* ['t', 'turn', 'pi', 'mouse'];
  }

  callUser(fn: UserFn, args: Value[], at: Pos): Value {
    if (args.length !== fn.params.length) {
      const want = fn.params.length;
      throw rt(
        want === 0 ? `${fn.name} doesn't take any values (got ${args.length})` : `${fn.name} needs ${want} value${want === 1 ? '' : 's'}: ${fn.params.join(', ')} (got ${args.length})`,
        at,
        want === 0 ? fn.name : `${fn.name} ${fn.params.join(', ')}`,
      );
    }
    if (this.depth >= this.limits.maxDepth) {
      throw rt(`${fn.name} called itself more than ${this.limits.maxDepth} times deep`, at, 'make sure it stops calling itself at some point (use if)');
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

  private globalsNow(): Scope {
    let s = this.active;
    while (s.parent) s = s.parent;
    return s;
  }

  binary(op: string, a: Value, b: Value, at: Pos): Value {
    // In arithmetic, true and false count as 1 and 0: (i % 2 == 0) * 20
    if ('+-*/%^'.includes(op) && (typeof a === 'boolean' || typeof b === 'boolean') && (typeof a === 'number' || typeof a === 'boolean') && (typeof b === 'number' || typeof b === 'boolean')) {
      a = Number(a);
      b = Number(b);
    }
    switch (op) {
      case '+':
        if (typeof a === 'number' && typeof b === 'number') return a + b;
        if (typeof a === 'string' || typeof b === 'string') {
          const s = show(a) + show(b);
          if (s.length > this.limits.maxText) throw rt(`this text is longer than ${this.limits.maxText} characters`, at);
          return s;
        }
        if (Array.isArray(a) && Array.isArray(b)) {
          if (a.length + b.length > this.limits.maxList) {
            throw rt(`this list would have more than ${this.limits.maxList.toLocaleString('en-US')} items, which is the most a list can hold`, at, 'use fewer items');
          }
          return a.concat(b);
        }
        if (Array.isArray(a)) throw rt(`can't add ${typeName(b)} to a list directly`, at, 'wrap it in brackets: list + [item]');
        break;
      case '-':
        if (typeof a === 'number' && typeof b === 'number') return a - b;
        break;
      case '*':
        if (typeof a === 'number' && typeof b === 'number') return a * b;
        if (isPoint(a) && typeof b === 'number') return pt(a.x * b, a.y * b);
        if (typeof a === 'number' && isPoint(b)) return pt(a * b.x, a * b.y);
        if (isPoint(a) && isPoint(b)) return pt(a.x * b.x, a.y * b.y);
        break;
      case '/':
        if (typeof a === 'number' && typeof b === 'number') return a / b;
        if (isPoint(a) && typeof b === 'number') return pt(a.x / b, a.y / b);
        break;
      case '%':
        if (typeof a === 'number' && typeof b === 'number') {
          if (b === 0) return NaN;
          return a - b * Math.floor(a / b);
        }
        break;
      case '^':
        if (typeof a === 'number' && typeof b === 'number') return Math.pow(a, b);
        break;
      case '==': return equal(a, b);
      case '!=': return !equal(a, b);
      case '<': case '>': case '<=': case '>=':
        if (typeof a === 'number' && typeof b === 'number') {
          return op === '<' ? a < b : op === '>' ? a > b : op === '<=' ? a <= b : a >= b;
        }
        if (typeof a === 'string' && typeof b === 'string') {
          return op === '<' ? a < b : op === '>' ? a > b : op === '<=' ? a <= b : a >= b;
        }
        throw rt(`${op} compares numbers, but got ${typeName(a)} and ${typeName(b)}`, at);
    }
    if ((op === '+' || op === '-') && isPoint(a) && isPoint(b)) return pt(op === '+' ? a.x + b.x : a.x - b.x, op === '+' ? a.y + b.y : a.y - b.y);
    if ((op === '+' || op === '-') && isPoint(a) && typeof b === 'number') return pt(op === '+' ? a.x + b : a.x - b, op === '+' ? a.y + b : a.y - b);
    const verb = { '+': 'add', '-': 'subtract', '*': 'multiply', '/': 'divide', '%': 'take % of', '^': 'raise' }[op] ?? op;
    let hint: string | undefined;
    if (isColor(a) || isColor(b)) hint = 'to blend colors use mix(a, b, k); to see through one use fade(c, k)';
    else if (a === null || b === null) hint = 'a make whose last line is a command gives back nothing; end it with a value';
    throw rt(`can't ${verb} ${typeName(a)} and ${typeName(b)}`, at, hint);
  }
}

// ---- built-in functions ----

const COMMAND_SPECS: Record<string, CommandSpec> = Object.fromEntries(COMMANDS.map((c) => [c.name, c]));
const FN_SPECS = Object.fromEntries(FUNCTIONS.map((f) => [f.name, f]));

function checkArity(name: string, args: Value[], at: Pos): void {
  const spec = FN_SPECS[name];
  const [lo, hi] = spec.arity;
  if (args.length < lo || args.length > hi) {
    const want = lo === hi ? `${lo}` : hi >= 99 ? `at least ${lo}` : `${lo} to ${hi}`;
    throw rt(`${name} takes ${want} value${hi === 1 ? '' : 's'} (got ${args.length})`, at, spec.usage);
  }
}

function num(name: string, v: Value, at: Pos, what = 'a number'): number {
  if (typeof v !== 'number') throw rt(`${name} needs ${what}, but got ${typeName(v)}`, at, FN_SPECS[name]?.usage);
  return v;
}

function col(name: string, v: Value, at: Pos): Color {
  if (!isColor(v)) throw rt(`${name} needs a color, but got ${typeName(v)}`, at, FN_SPECS[name]?.usage);
  return v;
}

function math1(name: string, f: (x: number) => number): NativeFn {
  return {
    kind: 'native', name,
    call: (args, at) => {
      checkArity(name, args, at);
      return f(num(name, args[0], at));
    },
  };
}

const native = (name: string, call: NativeFn['call']): NativeFn => ({
  kind: 'native', name,
  call: (args, at, self) => {
    checkArity(name, args, at);
    return call(args, at, self);
  },
});

const NATIVES: Record<string, NativeFn> = {
  sin: math1('sin', Math.sin),
  cos: math1('cos', Math.cos),
  tan: math1('tan', Math.tan),
  sqrt: math1('sqrt', Math.sqrt),
  abs: math1('abs', Math.abs),
  floor: math1('floor', Math.floor),
  ceil: math1('ceil', Math.ceil),
  round: math1('round', Math.round),
  sign: math1('sign', Math.sign),
  ease: math1('ease', (k) => {
    const x = Math.max(0, Math.min(1, k));
    return x * x * x * (x * (x * 6 - 15) + 10);
  }),
  atan: native('atan', (a, at) => Math.atan2(num('atan', a[0], at), num('atan', a[1], at))),
  min: native('min', (a, at) => {
    const xs = a.length === 1 && Array.isArray(a[0]) ? a[0] : a;
    if (!xs.length) throw rt('min needs at least one number', at);
    return Math.min(...xs.map((x) => num('min', x, at)));
  }),
  max: native('max', (a, at) => {
    const xs = a.length === 1 && Array.isArray(a[0]) ? a[0] : a;
    if (!xs.length) throw rt('max needs at least one number', at);
    return Math.max(...xs.map((x) => num('max', x, at)));
  }),
  lerp: native('lerp', ([a, b, k], at) => {
    const kk = num('lerp', k, at, 'a number for k');
    if (typeof a === 'number' && typeof b === 'number') return a + (b - a) * kk;
    if (isPoint(a) && isPoint(b)) return pt(a.x + (b.x - a.x) * kk, a.y + (b.y - a.y) * kk);
    if (isColor(a) && isColor(b)) return mix(a, b, kk);
    throw rt(`lerp goes between two numbers, two points or two colors, not ${typeName(a)} and ${typeName(b)}`, at, 'lerp(a, b, k)');
  }),
  clamp: native('clamp', (a, at) => {
    const x = num('clamp', a[0], at);
    const lo = a.length > 1 ? num('clamp', a[1], at) : 0;
    const hi = a.length > 2 ? num('clamp', a[2], at) : 1;
    return Math.max(Math.min(lo, hi), Math.min(Math.max(lo, hi), x));
  }),
  noise: native('noise', (a, at) => noise3(num('noise', a[0], at), a.length > 1 ? num('noise', a[1], at) : 0, a.length > 2 ? num('noise', a[2], at) : 0)),
  rand: native('rand', (a, at, self) => {
    const r = self.rand.next();
    if (a.length === 0) return r;
    if (a.length === 1) return r * num('rand', a[0], at);
    const lo = num('rand', a[0], at);
    return lo + r * (num('rand', a[1], at) - lo);
  }),
  pick: native('pick', ([list], at, self) => {
    if (!Array.isArray(list) && typeof list !== 'string') throw rt(`pick needs a list, but got ${typeName(list)}`, at, 'pick([ember, sea, moss])');
    if (!list.length) throw rt('pick needs a list with something in it', at);
    return list[Math.floor(self.rand.next() * list.length)];
  }),
  hue: native('hue', (a, at) => hue(num('hue', a[0], at), a.length > 1 ? num('hue', a[1], at) : undefined, a.length > 2 ? num('hue', a[2], at) : undefined)),
  mix: native('mix', ([a, b, k], at) => mix(col('mix', a, at), col('mix', b, at), num('mix', k, at, 'a number for k'))),
  fade: native('fade', ([c, k], at) => fade(col('fade', c, at), num('fade', k, at))),
  rgb: native('rgb', (a, at) => rgba(num('rgb', a[0], at), num('rgb', a[1], at), num('rgb', a[2], at), a.length > 3 ? num('rgb', a[3], at) : 1)),
  polar: native('polar', ([r, a], at) => {
    const rr = num('polar', r, at);
    const aa = num('polar', a, at);
    return pt(rr * Math.cos(aa), rr * Math.sin(aa));
  }),
  dist: native('dist', ([a, b], at) => {
    if (!isPoint(a) || !isPoint(b)) throw rt('dist needs two points', at, 'dist((0, 0), (30, 40))');
    return Math.hypot(a.x - b.x, a.y - b.y);
  }),
  len: native('len', ([v], at) => {
    if (Array.isArray(v) || typeof v === 'string') return v.length;
    throw rt(`len needs a list or text, but got ${typeName(v)}`, at);
  }),
  range: native('range', ([n], at, self) => {
    const k = Math.floor(num('range', n, at));
    if (k > self.limits.maxList) throw rt(`range(${k}) would be longer than ${self.limits.maxList.toLocaleString('en-US')} items`, at);
    return Array.from({ length: Math.max(0, k) }, (_, i) => i);
  }),
};

export interface ShellState {
  globals: Scope;
  fns: Map<string, UserFn>;
  rand: Rand;
}

/** A REPL session: each chunk runs in the same top level. */
export class Shell {
  private state: ShellState = { globals: new Scope(null), fns: new Map(), rand: new Rand(1) };

  run(chunk: string): { value: Value; text: string; logs: string[] } {
    const it = new Interp(chunk, {}, this.state.fns.keys());
    it.attach(this.state);
    const { value, logs } = it.evaluate();
    const last = it.program.body[it.program.body.length - 1];
    const showValue = last !== undefined && (last.t === 'expr' || (last.t === 'callstmt' && value !== null));
    return { value, text: showValue ? show(value) : '', logs };
  }
}

export type { ErrorInfo };
