// Runs every piece on the page. User code never sees this file's scope: the language has
// no way to reach JavaScript, and on top of that the network, storage and script loading
// are removed from the worker before any piece runs.

import { Interp, drawFrame, hashOps, squeeze, toErrorInfo, TEXT_FONT, type Ctx2D, type Frame } from 'squiggle-core';
import type { FromWorker, Inspection, Job, ToWorker } from './protocol.ts';
import { encodeClip } from './clip.ts';

// The page's TypeScript setup uses the DOM library, so describe the worker scope we use.
interface WorkerScope {
  postMessage(message: unknown, transfer: Transferable[]): void;
  onmessage: ((ev: MessageEvent<ToWorker>) => void) | null;
  requestAnimationFrame?: (cb: () => void) => number;
  fonts: FontFaceSet;
}
declare const self: WorkerScope;

const fontReady = (async () => {
  try {
    const face = new FontFace(TEXT_FONT, 'url(/fonts/Fraunces_400Regular.ttf)');
    self.fonts.add(face);
    await face.load();
  } catch {
    // Text falls back to the platform serif.
  }
})();

// Close every door before running anything.
void fontReady.finally(() => {
  for (const name of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts', 'indexedDB', 'caches', 'BroadcastChannel', 'WebTransport', 'Worker', 'SharedWorker']) {
    try {
      Object.defineProperty(self, name, { value: undefined, configurable: false, writable: false });
    } catch {
      // not present here
    }
  }
});

const post = (m: FromWorker, transfer: Transferable[] = []) => self.postMessage(m, transfer);

interface Piece {
  id: number;
  it: Interp | null;
  code: string;
  canvas?: OffscreenCanvas;
  ctx?: OffscreenCanvasRenderingContext2D;
  px: number;
  playing: boolean;
  base: number; // t when last started or seeked
  since: number; // performance.now() at that moment
  visible: boolean;
  dirty: boolean;
  failed: boolean;
  lastTick: number;
  lastLogs: string;
  mouse: { x: number; y: number };
}

const pieces = new Map<number, Piece>();

const now = () => performance.now();
const timeOf = (p: Piece) => (p.playing ? p.base + (now() - p.since) / 1000 : p.base);

function compile(p: Piece, code: string, version: number): boolean {
  try {
    const it = new Interp(code);
    it.frame(0);
    p.it = it;
    p.code = code;
    p.failed = false;
    p.dirty = true;
    post({ op: 'ready', id: p.id, info: { animated: it.animated, interactive: it.interactive, keys: it.keys }, version });
    return true;
  } catch (e) {
    // Keep showing the last good version while the new one has a problem.
    post({ op: 'error', id: p.id, error: toErrorInfo(e), version, during: 'compile' });
    return false;
  }
}

function render(p: Piece): void {
  if (!p.it || p.failed) return;
  const t = timeOf(p);
  const started = now();
  let f: Frame;
  try {
    f = p.it.frame(t, p.mouse);
  } catch (e) {
    p.failed = true;
    p.playing = false;
    post({ op: 'error', id: p.id, error: toErrorInfo(e), version: -1, during: 'run' });
    return;
  }
  if (p.ctx) drawFrame(p.ctx as unknown as Ctx2D, f.ops, p.px);
  else post({ op: 'ops', id: p.id, ops: f.ops });
  const ms = now() - started;
  const logKey = f.logs.join('\n') + '\u0000' + f.warnings.map((w) => w.line + w.message).join();
  if (logKey !== p.lastLogs) {
    p.lastLogs = logKey;
    post({ op: 'logs', id: p.id, logs: f.logs.slice(-100), warnings: f.warnings });
  }
  if (started - p.lastTick > 120 || !p.playing) {
    p.lastTick = started;
    post({ op: 'tick', id: p.id, t, steps: f.steps, ms, playing: p.playing });
  }
  p.dirty = false;
}

const raf: (cb: () => void) => void =
  typeof self.requestAnimationFrame === 'function' ? (cb) => self.requestAnimationFrame!(cb) : (cb) => setTimeout(cb, 16);

function loop(): void {
  for (const p of pieces.values()) {
    if (!p.visible || !p.it) continue;
    if ((p.playing && p.it.animated) || p.dirty) render(p);
  }
  raf(loop);
}
void fontReady.then(() => raf(loop));

function piece(id: number): Piece | undefined {
  return pieces.get(id);
}

function runJob(job: Job): unknown {
  switch (job.kind) {
    case 'squeeze':
      return squeeze(job.code);
    case 'frames': {
      const it = new Interp(job.code);
      return job.times.map((t) => it.frame(t).ops);
    }
    case 'inspect': {
      const it = new Interp(job.code);
      const frames = job.times.map((t) => it.frame(t, { x: 0, y: 0 }));
      const kinds: Record<string, number> = {};
      const papers = new Set<string>();
      const colors = new Set<string>();
      let transformed = false;
      for (const op of frames[0].ops.slice(1)) {
        kinds[op.k] = (kinds[op.k] ?? 0) + 1;
        if (op.k === 'paper') papers.add(op.c);
        else {
          colors.add(op.c);
          const m = op.m;
          if (m[0] !== 1 || m[1] !== 0 || m[2] !== 0 || m[3] !== 1 || m[4] !== 0 || m[5] !== 0) transformed = true;
        }
      }
      const out: Inspection = {
        animated: it.animated, interactive: it.interactive, kinds, papers: [...papers], colors: [...colors], transformed,
        hashes: frames.map((f) => hashOps(f.ops)), shapes: frames[0].ops.length - 1,
      };
      return out;
    }
  }
}

self.onmessage = async (ev: MessageEvent<ToWorker>) => {
  const m = ev.data;
  switch (m.op) {
    case 'ping':
      post({ op: 'pong', n: m.n });
      return;
    case 'mount': {
      const p: Piece = {
        id: m.id, it: null, code: '', px: m.px, playing: m.autoplay, base: m.t ?? 0, since: now(),
        visible: true, dirty: true, failed: false, lastTick: 0, lastLogs: '', mouse: { x: 0, y: 0 },
      };
      if (m.canvas) {
        p.canvas = m.canvas;
        p.canvas.width = p.canvas.height = m.px;
        p.ctx = p.canvas.getContext('2d') ?? undefined;
      }
      pieces.set(m.id, p);
      compile(p, m.code, 0);
      return;
    }
    case 'unmount':
      pieces.delete(m.id);
      return;
    case 'job':
      try {
        post({ op: 'result', req: m.req, value: runJob(m.job) });
      } catch (e) {
        post({ op: 'fail', req: m.req, message: toErrorInfo(e).message, error: toErrorInfo(e) });
      }
      return;
  }
  const p = piece(m.id);
  if (!p) return;
  switch (m.op) {
    case 'code':
      compile(p, m.code, m.version);
      return;
    case 'play':
      if (p.failed) {
        p.failed = false;
      }
      if (!p.playing) {
        p.since = now();
        p.playing = true;
      }
      p.dirty = true;
      return;
    case 'pause':
      p.base = timeOf(p);
      p.playing = false;
      p.dirty = true;
      return;
    case 'seek':
      p.base = Math.max(0, m.t);
      p.since = now();
      p.failed = false;
      p.dirty = true;
      return;
    case 'restart':
      p.base = 0;
      p.since = now();
      p.failed = false;
      if (p.code) compile(p, p.code, -1);
      p.dirty = true;
      return;
    case 'size':
      p.px = m.px;
      if (p.canvas) p.canvas.width = p.canvas.height = m.px;
      p.dirty = true;
      return;
    case 'visible':
      p.visible = m.visible;
      p.dirty = true;
      return;
    case 'pointer':
      p.mouse = { x: m.x, y: m.y };
      p.dirty = true;
      return;
    case 'click':
    case 'key':
      if (!p.it) return;
      try {
        if (m.op === 'click') p.it.click(m.x, m.y, timeOf(p));
        else p.it.press(m.key, timeOf(p));
        p.dirty = true;
      } catch (e) {
        post({ op: 'error', id: p.id, error: toErrorInfo(e), version: -1, during: 'run' });
      }
      return;
    case 'png': {
      try {
        // A fresh interpreter, so exports never depend on clicks or keys pressed so far.
        const it = new Interp(p.code);
        const c = new OffscreenCanvas(m.px, m.px);
        drawFrame(c.getContext('2d') as unknown as Ctx2D, it.frame(m.t).ops, m.px);
        post({ op: 'blob', req: m.req, blob: await c.convertToBlob({ type: 'image/png' }), kind: 'png' });
      } catch (e) {
        post({ op: 'fail', req: m.req, message: toErrorInfo(e).message });
      }
      return;
    }
    case 'clip': {
      try {
        const it = new Interp(p.code);
        const { blob, kind } = await encodeClip(it, m, (done, total) => post({ op: 'progress', req: m.req, done, total }));
        post({ op: 'blob', req: m.req, blob, kind });
      } catch (e) {
        post({ op: 'fail', req: m.req, message: e instanceof Error ? e.message : String(e) });
      }
      return;
    }
  }
};
