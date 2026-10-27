// A Stage is one canvas on the page running one piece. All stages share one worker.

import { drawFrame, type Ctx2D, type ErrorInfo, type Op, type Warning } from 'squiggle-core';
import type { FromWorker, Job, PieceInfo, ToWorker } from './protocol.ts';
import StageWorker from './stage.worker.ts?worker';
import { encodeFrames, GIF_FPS } from './clip.ts';

export interface StageOptions {
  code: string;
  autoplay?: boolean;
  /** forward pointer, clicks and keys to the piece (default true) */
  interactive?: boolean;
  /** element that receives key presses for the piece (default: the canvas, made focusable) */
  keyTarget?: HTMLElement | Document;
  /** start at this t */
  t?: number;
  onReady?: (info: PieceInfo) => void;
  onError?: (error: ErrorInfo, during: 'compile' | 'run') => void;
  onTick?: (t: number, steps: number, ms: number, playing: boolean) => void;
  onLogs?: (logs: string[], warnings: Warning[]) => void;
}

const KEY_MAP: Record<string, string> = { ' ': 'space', Enter: 'enter', ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', Tab: 'tab', Backspace: 'backspace', Escape: 'escape' };

const offscreenOK = typeof HTMLCanvasElement !== 'undefined' && 'transferControlToOffscreen' in HTMLCanvasElement.prototype && typeof OffscreenCanvas !== 'undefined';

class Engine {
  worker!: Worker;
  stages = new Map<number, Stage>();
  pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; progress?: (d: number, t: number) => void }>();
  private lastPong = performance.now();
  private pings = 0;

  constructor() {
    this.start();
    setInterval(() => this.watch(), 1500);
  }

  private start(): void {
    this.worker = new StageWorker();
    this.lastPong = performance.now();
    this.worker.onmessage = (ev: MessageEvent<FromWorker>) => this.receive(ev.data);
  }

  private watch(): void {
    if (document.hidden) {
      this.lastPong = performance.now();
      return;
    }
    if (performance.now() - this.lastPong > 6000 && this.stages.size) {
      // The worker stopped answering (it shouldn't: every piece has a step budget). Start over.
      this.worker.terminate();
      for (const p of this.pending.values()) p.reject(new Error('the renderer restarted'));
      this.pending.clear();
      this.start();
      for (const s of this.stages.values()) s.remount('the piece stopped responding, so it was restarted');
      return;
    }
    this.send({ op: 'ping', n: ++this.pings });
  }

  send(m: ToWorker, transfer: Transferable[] = []): void {
    this.worker.postMessage(m, transfer);
  }

  private receive(m: FromWorker): void {
    switch (m.op) {
      case 'pong':
        this.lastPong = performance.now();
        return;
      case 'blob':
        this.pending.get(m.req)?.resolve({ blob: m.blob, kind: m.kind });
        this.pending.delete(m.req);
        return;
      case 'fail':
        this.pending.get(m.req)?.reject(Object.assign(new Error(m.message), { error: m.error }));
        this.pending.delete(m.req);
        return;
      case 'result':
        this.pending.get(m.req)?.resolve(m.value);
        this.pending.delete(m.req);
        return;
      case 'progress':
        this.pending.get(m.req)?.progress?.(m.done, m.total);
        return;
    }
    this.lastPong = performance.now();
    this.stages.get(m.id)?.receive(m);
  }
}

let engine: Engine | null = null;
const getEngine = () => (engine ??= new Engine());
let nextId = 1;
let nextReq = 1;

/** Runs user code off the main thread for things that don't draw on screen (squeeze, learn checks). */
export function runJob<T>(job: Job): Promise<T> {
  const e = getEngine();
  const req = nextReq++;
  return new Promise((resolve, reject) => {
    e.pending.set(req, { resolve, reject });
    e.send({ op: 'job', req, job });
  });
}

export class Stage {
  readonly id = nextId++;
  canvas: HTMLCanvasElement;
  info: PieceInfo = { animated: false, interactive: false, keys: [] };
  playing: boolean;
  t = 0;
  private code: string;
  private version = 0;
  private opts: StageOptions;
  private ctx2d: CanvasRenderingContext2D | null = null;
  private px = 512;
  private observers: Array<{ disconnect(): void }> = [];
  private cleanup: Array<() => void> = [];

  constructor(canvas: HTMLCanvasElement, opts: StageOptions) {
    this.canvas = canvas;
    this.opts = opts;
    this.code = opts.code;
    this.playing = opts.autoplay ?? true;
    this.t = opts.t ?? 0;
    getEngine().stages.set(this.id, this);
    this.attach();
  }

  private measure(): number {
    const w = this.canvas.getBoundingClientRect().width || 512;
    return Math.max(64, Math.min(2048, Math.round(w * Math.min(2, window.devicePixelRatio || 1))));
  }

  private attach(): void {
    const e = getEngine();
    this.px = this.measure();
    if (offscreenOK) {
      const off = this.canvas.transferControlToOffscreen();
      e.send({ op: 'mount', id: this.id, canvas: off, px: this.px, code: this.code, autoplay: this.playing, t: this.t }, [off]);
    } else {
      this.canvas.width = this.canvas.height = this.px;
      this.ctx2d = this.canvas.getContext('2d');
      e.send({ op: 'mount', id: this.id, px: this.px, code: this.code, autoplay: this.playing, t: this.t });
    }
    const ro = new ResizeObserver(() => {
      const px = this.measure();
      if (px !== this.px) {
        this.px = px;
        if (this.ctx2d) this.canvas.width = this.canvas.height = px;
        e.send({ op: 'size', id: this.id, px });
      }
    });
    ro.observe(this.canvas);
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) e.send({ op: 'visible', id: this.id, visible: en.isIntersecting });
    }, { rootMargin: '120px' });
    io.observe(this.canvas);
    this.observers.push(ro, io);
    if (this.opts.interactive !== false) this.listen();
  }

  private sheetPoint(ev: PointerEvent | MouseEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: ((ev.clientX - r.left) / r.width) * 512 - 256, y: 256 - ((ev.clientY - r.top) / r.height) * 512 };
  }

  private listen(): void {
    const c = this.canvas;
    const on = <K extends keyof HTMLElementEventMap>(el: HTMLElement | Document, type: K, fn: (ev: HTMLElementEventMap[K]) => void) => {
      el.addEventListener(type, fn as EventListener);
      this.cleanup.push(() => el.removeEventListener(type, fn as EventListener));
    };
    on(c, 'pointermove', (ev) => {
      const p = this.sheetPoint(ev);
      getEngine().send({ op: 'pointer', id: this.id, ...p });
    });
    on(c, 'click', (ev) => {
      if (!this.info.interactive) return;
      getEngine().send({ op: 'click', id: this.id, ...this.sheetPoint(ev) });
    });
    const target = this.opts.keyTarget ?? c;
    if (target === c && !c.hasAttribute('tabindex')) c.tabIndex = 0;
    on(target, 'keydown', (ev) => {
      if (!this.info.keys.length) return;
      const tag = (ev.target as HTMLElement | null)?.closest?.('input, textarea, [contenteditable=true], .cm-editor');
      if (tag && target !== c) return;
      const key = KEY_MAP[ev.key] ?? (ev.key.length === 1 ? ev.key.toLowerCase() : '');
      if (!key || !this.info.keys.includes(key)) return;
      ev.preventDefault();
      getEngine().send({ op: 'key', id: this.id, key });
    });
  }

  /** after a worker restart: a canvas can only be handed over once, so swap in a fresh one */
  remount(reason: string): void {
    for (const o of this.observers) o.disconnect();
    for (const c of this.cleanup) c();
    this.observers = [];
    this.cleanup = [];
    const fresh = this.canvas.cloneNode(false) as HTMLCanvasElement;
    this.canvas.replaceWith(fresh);
    this.canvas = fresh;
    this.playing = false;
    this.attach();
    this.opts.onError?.({ kind: 'runtime', message: reason, line: 1, col: 1, len: 1 }, 'run');
  }

  receive(m: FromWorker): void {
    switch (m.op) {
      case 'ready':
        this.info = m.info;
        this.canvas.classList.toggle('is-interactive', m.info.interactive);
        this.opts.onReady?.(m.info);
        return;
      case 'error':
        if (m.during === 'run') this.playing = false;
        this.opts.onError?.(m.error, m.during);
        return;
      case 'tick':
        this.t = m.t;
        this.opts.onTick?.(m.t, m.steps, m.ms, m.playing);
        return;
      case 'logs':
        this.opts.onLogs?.(m.logs, m.warnings);
        return;
      case 'ops':
        if (this.ctx2d) drawFrame(this.ctx2d as unknown as Ctx2D, m.ops as Op[], this.px);
        return;
    }
  }

  setCode(code: string): void {
    if (code === this.code) return;
    this.code = code;
    getEngine().send({ op: 'code', id: this.id, code, version: ++this.version });
  }

  play(): void {
    this.playing = true;
    getEngine().send({ op: 'play', id: this.id });
  }

  pause(): void {
    this.playing = false;
    getEngine().send({ op: 'pause', id: this.id });
  }

  toggle(): boolean {
    if (this.playing) this.pause();
    else this.play();
    return this.playing;
  }

  restart(): void {
    getEngine().send({ op: 'restart', id: this.id });
    if (!this.playing) this.play();
  }

  seek(t: number): void {
    this.t = t;
    getEngine().send({ op: 'seek', id: this.id, t });
  }

  private request(m: Omit<Extract<ToWorker, { op: 'png' }>, 'req'> | Omit<Extract<ToWorker, { op: 'clip' }>, 'req'>, progress?: (d: number, t: number) => void): Promise<{ blob: Blob; kind: string }> {
    const e = getEngine();
    const req = nextReq++;
    return new Promise((resolve, reject) => {
      e.pending.set(req, { resolve, reject, progress });
      e.send({ ...m, req } as ToWorker);
    });
  }

  /** a PNG of the frame at t, from a fresh run of the code */
  async png(px: number, t: number): Promise<Blob> {
    if (typeof OffscreenCanvas !== 'undefined') return (await this.request({ op: 'png', id: this.id, px, t })).blob;
    // No OffscreenCanvas: the worker still runs the code, the page only draws the shapes.
    const [ops] = await runJob<Op[][]>({ kind: 'frames', code: this.code, times: [t] });
    const c = Object.assign(document.createElement('canvas'), { width: px, height: px });
    drawFrame(c.getContext('2d') as unknown as Ctx2D, ops, px);
    return await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('no PNG'))), 'image/png'));
  }

  async clip(seconds: number, progress: (d: number, t: number) => void): Promise<{ blob: Blob; kind: string }> {
    const r = { seconds, fps: 30, px: 512, kind: 'mp4' as const };
    if (typeof OffscreenCanvas !== 'undefined') return await this.request({ op: 'clip', id: this.id, ...r }, progress);
    const times = Array.from({ length: seconds * GIF_FPS }, (_, i) => i / GIF_FPS);
    const frames = await runJob<Op[][]>({ kind: 'frames', code: this.code, times });
    return await encodeFrames((t) => frames[Math.round(t * GIF_FPS)], { ...r, kind: 'gif' }, progress);
  }

  destroy(): void {
    for (const o of this.observers) o.disconnect();
    for (const c of this.cleanup) c();
    getEngine().send({ op: 'unmount', id: this.id });
    getEngine().stages.delete(this.id);
  }
}
