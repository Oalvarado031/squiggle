// Static pages come from the Vite build; the Worker fills in what changes: the weekly
// prompt, the CA chip, links from config, and a piece's title, data and OG card.

import type { Env } from './env.ts';
import { sha256 } from './util.ts';

/** The inline script in src/partials/head.html that applies the saved theme before paint. */
export const THEME_SCRIPT = "try{if(localStorage.getItem('sq-theme')==='night')document.documentElement.dataset.theme='night'}catch(e){}";

let scriptHash: Promise<string> | null = null;
function themeHash(): Promise<string> {
  scriptHash ??= crypto.subtle.digest('SHA-256', new TextEncoder().encode(THEME_SCRIPT)).then((b) => btoa(String.fromCharCode(...new Uint8Array(b))));
  return scriptHash;
}

export async function securityHeaders(h: Headers): Promise<void> {
  h.set(
    'content-security-policy',
    [
      "default-src 'self'",
      // Cloudflare Web Analytics (cookie-free) is injected on the custom domain
      `script-src 'self' 'sha256-${await themeHash()}' https://static.cloudflareinsights.com`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      // the beacon loads from static.cloudflareinsights.com and reports to cloudflareinsights.com
      "connect-src 'self' https://static.cloudflareinsights.com https://cloudflareinsights.com",
      "worker-src 'self' blob:",
      "media-src 'self' blob:",
      "frame-ancestors 'none'",
      "base-uri 'none'",
      "form-action 'self'",
      "object-src 'none'",
    ].join('; '),
  );
  h.set('x-content-type-options', 'nosniff');
  h.set('referrer-policy', 'strict-origin-when-cross-origin');
  h.set('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  h.set('cross-origin-opener-policy', 'same-origin');
}

export interface PageData {
  /** squigglelang is on npm: show the command, otherwise "coming soon" */
  cli?: boolean;
  title?: string;
  description?: string;
  image?: string;
  canonical?: string;
  /** JSON for <script id="piece-data"> */
  data?: unknown;
  theme: string;
}

class Attr {
  constructor(private name: string, private value: string) {}
  element(el: Element) {
    el.setAttribute(this.name, this.value);
  }
}

class Text {
  constructor(private value: string) {}
  element(el: Element) {
    el.setInnerContent(this.value);
  }
}

/** Fills a link from config, or removes it when its value is empty. */
class Link {
  constructor(private href: string) {}
  element(el: Element) {
    if (!this.href) {
      el.remove();
      return;
    }
    el.setAttribute('href', this.href);
    el.removeAttribute('hidden');
  }
}

class Author {
  constructor(private name: string, private url: string) {}
  element(el: Element) {
    if (!this.name) {
      el.remove();
      return;
    }
    const name = escAttr(this.name);
    el.setInnerContent(this.url ? `made by <a href="${escAttr(this.url)}" rel="noopener">${name}</a>` : `made by ${name}`, { html: true });
    el.removeAttribute('hidden');
  }
}

export interface Links {
  repo: string;
  x: string;
}

export function links(env: Env): Links {
  return { repo: (env.REPO_URL ?? '').replace(/\/+$/, ''), x: env.X_URL ?? '' };
}

class Append {
  constructor(private html: string) {}
  element(el: Element) {
    el.append(this.html, { html: true });
  }
}

const escAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export async function page(env: Env, res: Response, origin: string, p: PageData, status = res.status): Promise<Response> {
  let rw = new HTMLRewriter()
    .on('[data-prompt]', new Text(p.theme))
    .on('.ca-chip', new Attr('data-mint', env.TOKEN_MINT ?? ''))
    .on('a[data-link="repo"]', new Link(links(env).repo))
    .on('a[data-link="repo-action"]', new Link(links(env).repo && `${links(env).repo}/tree/main/action/squiggle-render`))
    .on('a[data-link="x"]', new Link(links(env).x))
    .on('[data-link="author"]', new Author(env.AUTHOR_NAME ?? '', env.AUTHOR_URL ?? ''));
  rw = rw
    .on('[data-cli="soon"]', {
      element(el) {
        if (p.cli) el.remove();
      },
    })
    .on('[data-cli="ready"]', {
      element(el) {
        if (p.cli) el.removeAttribute('hidden');
        else el.remove();
      },
    });
  const image = p.image ? new URL(p.image, origin).toString() : `${origin}/og/site.png`;
  rw = rw.on('meta[property="og:image"]', new Attr('content', image));
  if (p.title) {
    rw = rw.on('title', new Text(p.title)).on('meta[property="og:title"]', new Attr('content', p.title));
  }
  if (p.description) {
    rw = rw.on('meta[name="description"]', new Attr('content', p.description)).on('meta[property="og:description"]', new Attr('content', p.description));
  }
  const head = [
    `<meta name="twitter:image" content="${escAttr(image)}">`,
    `<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">`,
    p.canonical ? `<link rel="canonical" href="${escAttr(new URL(p.canonical, origin).toString())}"><meta property="og:url" content="${escAttr(new URL(p.canonical, origin).toString())}">` : '',
  ].join('');
  rw = rw.on('head', new Append(head));
  if (p.data !== undefined) {
    // </script> can't appear inside: < is escaped in the JSON.
    rw = rw.on('script#piece-data', new Text(JSON.stringify(p.data).replace(/</g, '\\u003c')));
  }
  const out = rw.transform(new Response(res.body, { status, headers: res.headers }));
  const headers = new Headers(out.headers);
  headers.set('content-type', 'text/html; charset=utf-8');
  headers.set('cache-control', 'public, max-age=0, must-revalidate');
  await securityHeaders(headers);
  return new Response(out.body, { status, headers });
}

export async function etagFor(text: string): Promise<string> {
  return `"${(await sha256(text)).slice(0, 20)}"`;
}
