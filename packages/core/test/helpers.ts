import { Interp, toErrorInfo, type ErrorInfo, type Op } from '../src/index.ts';

/** shapes drawn at time t, without the default paper */
export function ops(code: string, t = 0): Op[] {
  return new Interp(code).frame(t).ops.slice(1);
}

export function logs(code: string, t = 0): string[] {
  return new Interp(code).frame(t).logs;
}

/** the value printed by the last say */
export function said(code: string): string {
  const l = logs(code);
  return l[l.length - 1];
}

export function error(code: string, t = 0): ErrorInfo {
  try {
    new Interp(code).frame(t);
  } catch (e) {
    return toErrorInfo(e);
  }
  throw new Error(`expected an error from:\n${code}`);
}
