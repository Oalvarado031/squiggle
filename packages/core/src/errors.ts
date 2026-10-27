// Every problem Squiggle reports is a SquiggleError: where it happened, what went wrong
// in plain words, and (when we can guess) a line that would fix it.

export type ErrorKind = 'syntax' | 'runtime' | 'budget';

export interface Where {
  line: number; // 1-based
  col: number; // 1-based
  len?: number; // characters to underline (default 1)
}

export class SquiggleError extends Error {
  readonly kind: ErrorKind;
  readonly line: number;
  readonly col: number;
  readonly len: number;
  readonly hint?: string;

  constructor(kind: ErrorKind, message: string, where: Where, hint?: string) {
    super(message);
    this.name = 'SquiggleError';
    this.kind = kind;
    this.line = where.line;
    this.col = where.col;
    this.len = Math.max(1, where.len ?? 1);
    this.hint = hint;
  }

  toJSON(): ErrorInfo {
    return { kind: this.kind, message: this.message, line: this.line, col: this.col, len: this.len, hint: this.hint };
  }
}

export interface ErrorInfo {
  kind: ErrorKind;
  message: string;
  line: number;
  col: number;
  len: number;
  hint?: string;
}

/** Prints an error the way the CLI and the studio show it:
 *
 *   line 3, col 5: dot needs 3 numbers: x, y, size
 *     3 |     dot 10, 20
 *       |     ^^^
 *   try: dot 10, 20, 8
 */
export function formatError(err: ErrorInfo, source: string): string {
  const lines = source.split(/\r?\n/);
  const text = lines[err.line - 1] ?? '';
  const num = String(err.line);
  const pad = ' '.repeat(num.length);
  const caretCol = Math.max(1, Math.min(err.col, text.length + 1));
  const caretLen = Math.max(1, Math.min(err.len, Math.max(1, text.length - caretCol + 1)));
  const out = [
    `line ${err.line}, col ${err.col}: ${err.message}`,
    `  ${num} | ${text.replace(/\t/g, ' ')}`,
    `  ${pad} | ${' '.repeat(caretCol - 1)}${'^'.repeat(caretLen)}`,
  ];
  if (err.hint) out.push(`try: ${err.hint}`);
  return out.join('\n');
}

export function toErrorInfo(e: unknown): ErrorInfo {
  if (e instanceof SquiggleError) return e.toJSON();
  const message = e instanceof Error ? e.message : String(e);
  return { kind: 'runtime', message: `something broke inside Squiggle: ${message}`, line: 1, col: 1, len: 1 };
}

/** Edit distance where swapping two neighbors counts as one edit (dto → dot). */
export function distance(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  const d: number[][] = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[m][n];
}

export function closest(name: string, candidates: Iterable<string>): string | undefined {
  let best: string | undefined;
  let bestD = Infinity;
  const lower = name.toLowerCase();
  for (const c of candidates) {
    const d = distance(lower, c.toLowerCase());
    if (d < bestD || (d === bestD && best !== undefined && c.length < best.length)) {
      best = c;
      bestD = d;
    }
  }
  if (best === undefined) return undefined;
  const limit = name.length <= 3 ? 1 : name.length <= 6 ? 2 : 3;
  return bestD <= limit ? best : undefined;
}
