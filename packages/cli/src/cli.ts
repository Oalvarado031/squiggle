import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, readdirSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { deflateRawSync } from 'node:zlib';
import {
  BLOCK_WORDS, EXAMPLES, Interp, POST_LIMIT, SITE_URL, Shell, formatError, postLength, squeeze, tidy, toErrorInfo,
} from 'squiggle-core';

declare const __VERSION__: string;
const VERSION = typeof __VERSION__ === 'string' ? __VERSION__ : '0.0.0-dev';

const HELP = `squiggle ${VERSION}: code you can post

usage
  squiggle render <piece.sqg>… [--out file] [--t 1] [--size 1024]
  squiggle render <piece.sqg> --seconds 6 [--out clip.mp4|clip.gif] [--fps 30]
  squiggle shell                  try values and make blocks line by line
  squiggle tidy <piece.sqg> [-w]  lay the code out the standard way (-w writes the file)
  squiggle squeeze <piece.sqg> [-w]
                                  shorten it without changing the art, print the count
  squiggle check <piece.sqg>…     run each piece and report problems
  squiggle link <piece.sqg>       print a studio link with the code inside
  squiggle examples [dir]         list the starter pieces, or write them all to dir
  squiggle sheet <piece.sqg>… --out sheet.png
                                  a contact sheet of many pieces

A starter name works anywhere a file does:  squiggle render tide --out tide.png
More: ${SITE_URL}/reference`;

interface Flags {
  _: string[];
  [k: string]: string | boolean | string[];
}

function parseArgs(argv: string[]): Flags {
  const out: Flags = { _: [] };
  const short: Record<string, string> = { o: 'out', w: 'write', h: 'help', v: 'version', s: 'seconds' };
  for (let k = 0; k < argv.length; k++) {
    const a = argv[k];
    if (a.startsWith('--')) {
      const [name, value] = a.slice(2).split('=', 2);
      if (value !== undefined) out[name] = value;
      else if (['write', 'help', 'version', 'check', 'quiet'].includes(name)) out[name] = true;
      else out[name] = argv[++k] ?? '';
    } else if (/^-[a-z]$/.test(a)) {
      const name = short[a[1]] ?? a[1];
      if (['write', 'help', 'version'].includes(name)) out[name] = true;
      else out[name] = argv[++k] ?? '';
    } else out._.push(a);
  }
  return out;
}

class Exit extends Error {
  code: number;
  constructor(code: number) {
    super(`exit ${code}`);
    this.code = code;
  }
}

function fail(message: string): never {
  console.error(`squiggle: ${message}`);
  throw new Exit(1);
}

function num(flags: Flags, name: string, fallback: number, min: number, max: number): number {
  const v = flags[name];
  if (v === undefined) return fallback;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) fail(`--${name} must be a number from ${min} to ${max}`);
  return n;
}

/** Folders on the command line stand for the .sqg files inside them. */
function expand(refs: string[]): string[] {
  return refs.flatMap((r) =>
    existsSync(r) && statSync(r).isDirectory() ? readdirSync(r).filter((f) => f.endsWith('.sqg')).sort().map((f) => join(r, f)) : [r],
  );
}

/** a .sqg path, or the name of a starter piece */
function load(ref: string): { name: string; code: string; path?: string } {
  if (existsSync(ref) && statSync(ref).isFile()) {
    return { name: basename(ref, extname(ref)), code: readFileSync(ref, 'utf8'), path: ref };
  }
  const slug = basename(ref, '.sqg');
  const ex = EXAMPLES.find((e) => e.slug === slug);
  if (ex) return { name: ex.slug, code: ex.code };
  fail(`can't find ${ref} (not a file, and not a starter; see squiggle examples)`);
}

function compile(name: string, code: string): Interp {
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

async function render(flags: Flags): Promise<void> {
  const refs = expand(flags._.slice(1));
  if (!refs.length) fail('render needs a piece, like: squiggle render piece.sqg --out piece.png');
  const seconds = flags.seconds !== undefined ? num(flags, 'seconds', 6, 0.1, 60) : 0;
  const out = typeof flags.out === 'string' ? flags.out : undefined;
  if (out && refs.length > 1 && !(existsSync(out) && statSync(out).isDirectory())) fail('--out with several pieces must be a folder');
  const { stillPng, gif, mp4 } = await import('./raster.ts');
  for (const ref of refs) {
    const piece = load(ref);
    const it = compile(piece.name, piece.code);
    const defaultExt = seconds ? '.mp4' : '.png';
    let target = out ?? (piece.path ? piece.path.replace(/\.sqg$/i, '') + defaultExt : piece.name + defaultExt);
    if (out && existsSync(out) && statSync(out).isDirectory()) target = join(out, piece.name + defaultExt);
    mkdirSync(dirname(resolve(target)), { recursive: true });
    const ext = extname(target).toLowerCase();
    const started = Date.now();
    try {
      if (seconds) {
        if (ext !== '.mp4' && ext !== '.gif') fail('clips are .mp4 or .gif');
        const fps = num(flags, 'fps', ext === '.gif' ? 20 : 30, 1, 60);
        const px = num(flags, 'size', 512, 16, 2048);
        const progress = (done: number, total: number) => {
          if (process.stderr.isTTY && !flags.quiet) process.stderr.write(`\r${piece.name}: frame ${done}/${total}`);
        };
        const data = ext === '.gif' ? gif(it, { seconds, fps, px, onFrame: progress }) : await mp4(it, { seconds, fps, px: px - (px % 2), onFrame: progress });
        if (process.stderr.isTTY && !flags.quiet) process.stderr.write('\r');
        writeFileSync(target, data);
      } else {
        if (ext !== '.png') fail('stills are .png (add --seconds 6 for a clip)');
        const t = num(flags, 't', it.animated ? 1 : 0, 0, 3600);
        const px = num(flags, 'size', 1024, 16, 4096);
        writeFileSync(target, stillPng(it, t, px));
      }
    } catch (e) {
      if (e instanceof Exit) throw e;
      console.error(`${piece.name}: ${formatError(toErrorInfo(e), piece.code)}`);
      throw new Exit(1);
    }
    if (!flags.quiet) console.log(`${target}  (${((Date.now() - started) / 1000).toFixed(1)} s)`);
  }
}

function check(flags: Flags): void {
  const refs = expand(flags._.slice(1));
  if (!refs.length) fail('check needs at least one piece');
  let bad = 0;
  for (const ref of refs) {
    const piece = load(ref);
    try {
      const it = new Interp(piece.code);
      const warnings = new Set<string>();
      let steps = 0;
      let shapes = 0;
      for (const t of it.animated ? [0, 0.5, 1, 2, 3] : [0]) {
        const f = it.frame(t);
        steps = Math.max(steps, f.steps);
        shapes = Math.max(shapes, f.ops.length);
        for (const w of f.warnings) warnings.add(`line ${w.line}: ${w.message}`);
      }
      const n = postLength(piece.code);
      const cost = it.animated ? ` · ${steps.toLocaleString('en-US')} steps/frame` : '';
      console.log(`ok  ${piece.name}  ${n} chars${n <= POST_LIMIT ? ' · fits in a post' : ' · TOO LONG FOR A POST'}${it.animated ? ' · moves' : ' · still'}${it.interactive ? ' · interactive' : ''} · ${shapes} shapes${cost}`);
      for (const w of warnings) console.log(`    note: ${w}`);
    } catch (e) {
      bad++;
      console.log(`err ${piece.name}\n${formatError(toErrorInfo(e), piece.code).replace(/^/gm, '    ')}`);
    }
  }
  if (bad) throw new Exit(1);
}

function tidyCmd(flags: Flags): void {
  const piece = load(flags._[1] ?? fail('tidy needs a piece'));
  let out: string;
  try {
    out = tidy(piece.code);
  } catch (e) {
    console.error(formatError(toErrorInfo(e), piece.code));
    throw new Exit(1);
  }
  if (flags.write) {
    if (!piece.path) fail('-w needs a file');
    writeFileSync(piece.path, out);
    console.log(`tidied ${piece.path}`);
  } else process.stdout.write(out);
}

function squeezeCmd(flags: Flags): void {
  const piece = load(flags._[1] ?? fail('squeeze needs a piece'));
  let r;
  try {
    r = squeeze(piece.code);
  } catch (e) {
    console.error(formatError(toErrorInfo(e), piece.code));
    throw new Exit(1);
  }
  if (flags.write) {
    if (!piece.path) fail('-w needs a file');
    writeFileSync(piece.path, r.code + '\n');
  } else console.log(r.code);
  const fits = r.after <= POST_LIMIT ? 'fits in a post' : `${r.after - POST_LIMIT} over a post`;
  console.error(`\n${r.before} → ${r.after} chars · ${fits} · same art, checked frame by frame`);
}

function linkCmd(flags: Flags): void {
  const piece = load(flags._[1] ?? fail('link needs a piece'));
  const payload = deflateRawSync(Buffer.from(piece.code, 'utf8'), { level: 9 }).toString('base64url');
  const base = typeof flags.site === 'string' ? flags.site : SITE_URL;
  console.log(`${base.replace(/\/$/, '')}/studio?c=${payload}`);
}

function examplesCmd(flags: Flags): void {
  const dir = flags._[1];
  if (!dir) {
    for (const e of EXAMPLES) console.log(`${e.slug.padEnd(18)} ${String(postLength(e.code)).padStart(3)} chars`);
    return;
  }
  mkdirSync(dir, { recursive: true });
  for (const e of EXAMPLES) writeFileSync(join(dir, `${e.slug}.sqg`), e.code);
  console.log(`wrote ${EXAMPLES.length} pieces to ${dir}`);
}

async function sheetCmd(flags: Flags): Promise<void> {
  let refs = expand(flags._.slice(1));
  if (!refs.length) refs = EXAMPLES.map((e) => e.slug);
  const out = typeof flags.out === 'string' ? flags.out : 'sheet.png';
  const { sheet } = await import('./raster.ts');
  const items = refs.map((r) => {
    const p = load(r);
    try {
      return { label: p.name, it: new Interp(p.code) };
    } catch (e) {
      console.error(`${p.name}: ${formatError(toErrorInfo(e), p.code)}`);
      return { label: `${p.name} (error)`, it: new Interp('paper bone') };
    }
  });
  writeFileSync(out, sheet(items, num(flags, 't', 1, 0, 3600), num(flags, 'cols', 6, 1, 20), num(flags, 'cell', 240, 32, 1024)));
  console.log(out);
}

function shell(): Promise<void> {
  const sh = new Shell();
  const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: 'sqg> ' });
  console.log(`squiggle ${VERSION} shell. Values print as you go; blocks end with an empty line. .exit to leave.`);
  let buf: string[] = [];
  let depth = 0;
  const opens = (line: string) => {
    const w = line.trim().split(/\s+/)[0];
    return (BLOCK_WORDS as readonly string[]).includes(w);
  };
  const flush = () => {
    const chunk = buf.join('\n');
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
  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (!buf.length && (trimmed === '.exit' || trimmed === 'exit')) return rl.close();
    if (!buf.length && trimmed === '.help') {
      console.log('Type a value (2 + 3, hue(30), [1, 2]) to see it, or store one (x = 4).\nStart a block (make, repeat, if…), indent its lines, then an empty line runs it.');
      rl.prompt();
      return;
    }
    const brackets = (line.match(/[([]/g)?.length ?? 0) - (line.match(/[)\]]/g)?.length ?? 0);
    if (buf.length && trimmed === '' && depth <= 0) flush();
    else {
      buf.push(line);
      depth += brackets;
      if (!opens(line) && !/^\s/.test(line) && buf.length === 1 && depth <= 0) flush();
    }
    rl.setPrompt(buf.length ? '...  ' : 'sqg> ');
    rl.prompt();
  });
  return new Promise((done) => rl.on('close', () => {
    if (buf.length) flush();
    done();
  }));
}

export async function main(argv: string[]): Promise<number> {
  const flags = parseArgs(argv);
  const cmd = flags._[0];
  try {
    if (flags.version) {
      console.log(VERSION);
      return 0;
    }
    if (!cmd || flags.help || cmd === 'help') {
      console.log(HELP);
      return 0;
    }
    switch (cmd) {
      case 'render': await render(flags); break;
      case 'check': check(flags); break;
      case 'tidy': tidyCmd(flags); break;
      case 'squeeze': squeezeCmd(flags); break;
      case 'link': linkCmd(flags); break;
      case 'examples': examplesCmd(flags); break;
      case 'sheet': await sheetCmd(flags); break;
      case 'shell': await shell(); break;
      default:
        if (existsSync(cmd) && cmd.endsWith('.sqg')) {
          flags._.unshift('render');
          await render(flags);
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
