import type { ErrorInfo, Op, Warning } from 'squiggle-core';

/** page → worker */
export type ToWorker =
  | { op: 'mount'; id: number; canvas?: OffscreenCanvas; px: number; code: string; autoplay: boolean; t?: number }
  | { op: 'code'; id: number; code: string; version: number }
  | { op: 'play'; id: number }
  | { op: 'pause'; id: number }
  | { op: 'seek'; id: number; t: number }
  | { op: 'restart'; id: number }
  | { op: 'size'; id: number; px: number }
  | { op: 'visible'; id: number; visible: boolean }
  | { op: 'pointer'; id: number; x: number; y: number }
  | { op: 'click'; id: number; x: number; y: number }
  | { op: 'key'; id: number; key: string }
  | { op: 'png'; id: number; req: number; px: number; t: number }
  | { op: 'clip'; id: number; req: number; seconds: number; fps: number; px: number; kind: 'mp4' | 'gif' }
  | { op: 'unmount'; id: number }
  | { op: 'ping'; n: number }
  /** jobs that run user code but draw nothing on screen */
  | { op: 'job'; req: number; job: Job };

export type Job =
  | { kind: 'squeeze'; code: string }
  | { kind: 'inspect'; code: string; times: number[] }
  | { kind: 'frames'; code: string; times: number[] };

/** What a piece draws, summarized for the learn goals. */
export interface Inspection {
  animated: boolean;
  interactive: boolean;
  /** shapes per kind, at the first time asked */
  kinds: Record<string, number>;
  /** paper colors used (besides the default) */
  papers: string[];
  /** distinct shape colors */
  colors: string[];
  /** some shape is moved, spun or grown */
  transformed: boolean;
  /** frame hashes at each time asked */
  hashes: string[];
  shapes: number;
}

export interface PieceInfo {
  animated: boolean;
  interactive: boolean;
  keys: string[];
}

/** worker → page */
export type FromWorker =
  | { op: 'ready'; id: number; info: PieceInfo; version: number }
  | { op: 'error'; id: number; error: ErrorInfo; version: number; during: 'compile' | 'run' }
  | { op: 'tick'; id: number; t: number; steps: number; ms: number; playing: boolean }
  | { op: 'logs'; id: number; logs: string[]; warnings: Warning[] }
  | { op: 'ops'; id: number; ops: Op[] }
  | { op: 'blob'; req: number; blob: Blob; kind: string }
  | { op: 'progress'; req: number; done: number; total: number }
  | { op: 'fail'; req: number; message: string; error?: ErrorInfo }
  | { op: 'result'; req: number; value: unknown }
  | { op: 'pong'; n: number };
