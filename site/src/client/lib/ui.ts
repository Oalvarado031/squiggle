import '../styles/base.css';

export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T => root.querySelector(sel) as T;
export const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T[] => [...root.querySelectorAll(sel)] as T[];

export function store(key: string, value?: string): string | null {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch {
    // private mode: fine, nothing is remembered
  }
  return value ?? null;
}

let toastTimer = 0;
export function toast(text: string): void {
  const el = document.querySelector('.toast');
  if (!el) return;
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('show'), 2400);
}

export async function copy(text: string, done = 'Copied'): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast(done);
  } catch {
    const ta = Object.assign(document.createElement('textarea'), { value: text });
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    toast(done);
  }
}

/** A random id for this browser, used for one-like-per-browser. Not tied to anything else. */
export function browserId(): string {
  let id = store('sq-browser');
  if (!id || !/^[a-z0-9]{24}$/.test(id)) {
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    id = [...bytes].map((b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
    store('sq-browser', id);
  }
  return id;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error((body as { message?: string }).message ?? `request failed (${res.status})`), { status: res.status, body });
  return body as T;
}

export function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'squiggle';

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function ago(ms: number): string {
  const s = Math.max(1, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} d ago`;
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function setupTheme(): void {
  const btn = document.querySelector<HTMLButtonElement>('.theme-toggle');
  if (!btn) return;
  const sun = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6"/></svg>';
  const moon = btn.innerHTML;
  const sync = () => {
    const night = document.documentElement.dataset.theme === 'night';
    btn.innerHTML = night ? sun : moon;
    btn.setAttribute('aria-label', night ? 'Switch to paper' : 'Switch to night print');
    btn.title = night ? 'Paper' : 'Night print';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', night ? '#15130f' : '#f3eee4');
  };
  btn.addEventListener('click', () => {
    const night = document.documentElement.dataset.theme !== 'night';
    if (night) document.documentElement.dataset.theme = 'night';
    else delete document.documentElement.dataset.theme;
    store('sq-theme', night ? 'night' : 'paper');
    sync();
    document.dispatchEvent(new CustomEvent('sq-theme'));
  });
  sync();
}

/** The logo redraws itself on load and whenever you hover it. */
function setupMarks(): void {
  for (const mark of $$<SVGSVGElement>('.mark')) {
    const redraw = () => {
      mark.classList.remove('drawing');
      void mark.getBoundingClientRect();
      mark.classList.add('drawing');
    };
    if (mark.closest('.site-head')) redraw();
    mark.closest('a')?.addEventListener('mouseenter', redraw);
    mark.closest('a')?.addEventListener('focus', redraw);
  }
}

function setupNav(): void {
  const here = location.pathname.replace(/\/$/, '') || '/';
  for (const a of $$<HTMLAnchorElement>('.nav a')) {
    if (a.getAttribute('href') === here) a.setAttribute('aria-current', 'page');
  }
}

function setupMint(): void {
  const chip = document.querySelector<HTMLButtonElement>('.ca-chip');
  if (!chip) return;
  const mint = chip.dataset.mint ?? '';
  const val = chip.querySelector('.val');
  if (!mint) return;
  if (val) val.textContent = `${mint.slice(0, 4)}…${mint.slice(-4)}`;
  chip.disabled = false;
  chip.title = `Copy ${mint}`;
  chip.addEventListener('click', () => copy(mint, 'Contract address copied'));
}

export function boot(): void {
  setupTheme();
  setupMarks();
  setupNav();
  setupMint();
}

/** Plays a server-rendered preview sprite (a grid of frames) while it's on screen. */
export interface Preview {
  still: string;
  sprite: string;
  frames: number;
  fps: number;
  cols: number;
}

export function playPreview(el: HTMLElement, pv: Preview): void {
  el.style.backgroundImage = `url("${pv.still}")`;
  el.style.backgroundSize = '100% 100%';
  if (pv.frames <= 1 || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const rows = Math.ceil(pv.frames / pv.cols);
  let loaded = false;
  let timer = 0;
  let frame = 0;
  const show = () => {
    const c = frame % pv.cols;
    const r = Math.floor(frame / pv.cols);
    el.style.backgroundPosition = `${(c / Math.max(1, pv.cols - 1)) * 100}% ${(r / Math.max(1, rows - 1)) * 100}%`;
  };
  const start = () => {
    if (timer) return;
    const go = () => {
      el.style.backgroundImage = `url("${pv.sprite}")`;
      el.style.backgroundSize = `${pv.cols * 100}% ${rows * 100}%`;
      show();
      timer = window.setInterval(() => {
        frame = (frame + 1) % pv.frames;
        show();
      }, 1000 / pv.fps);
    };
    if (loaded) go();
    else {
      const img = new Image();
      img.onload = () => {
        loaded = true;
        if (timer === -1) {
          timer = 0;
          go();
        }
      };
      img.src = pv.sprite;
      timer = -1;
    }
  };
  const stop = () => {
    if (timer > 0) clearInterval(timer);
    timer = 0;
  };
  new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) start();
      else stop();
    }
  }, { threshold: 0.35 }).observe(el);
}
