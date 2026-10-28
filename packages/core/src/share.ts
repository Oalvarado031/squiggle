// Share links carry the code itself, compressed, so no account or server is needed.

const b64url = (bytes: Uint8Array): string => {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const unb64url = (s: string): Uint8Array => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

async function pump(stream: CompressionStream | DecompressionStream, data: Uint8Array): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  void writer.write(data as unknown as BufferSource);
  void writer.close();
  const buf = await new Response(stream.readable).arrayBuffer();
  return new Uint8Array(buf);
}

/** code → URL-safe payload (deflate-raw + base64url) */
export async function encodeCode(code: string): Promise<string> {
  const data = new TextEncoder().encode(code);
  return b64url(await pump(new CompressionStream('deflate-raw'), data));
}

/** payload → code; throws on anything that isn't a Squiggle share payload */
export async function decodeCode(payload: string): Promise<string> {
  if (!/^[A-Za-z0-9_-]{1,8000}$/.test(payload)) throw new Error('not a share payload');
  const bytes = await pump(new DecompressionStream('deflate-raw'), unb64url(payload));
  if (bytes.length > 20_000) throw new Error('share payload too large');
  return new TextDecoder().decode(bytes);
}

/** The code as it goes into a post: line endings normalized, trailing blanks dropped. */
export function postText(code: string): string {
  return code.replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').replace(/^\n+/, '').replace(/\n+$/, '');
}

/**
 * Characters as X counts them: most Latin text, punctuation and symbols count 1,
 * everything else (CJK, emoji…) counts 2.
 */
export function postLength(code: string): number {
  let n = 0;
  for (const ch of postText(code)) {
    const cp = ch.codePointAt(0)!;
    const light = (cp >= 0 && cp <= 4351) || (cp >= 8192 && cp <= 8205) || (cp >= 8208 && cp <= 8223) || (cp >= 8242 && cp <= 8247);
    n += light ? 1 : 2;
  }
  return n;
}

/** X shortens every link to 23 characters. */
export const LINK_LENGTH = 23;

/** The code and its link (on the next line) fit in one post. */
export function codeFitsWithLink(code: string): boolean {
  return postLength(code) + 1 + LINK_LENGTH <= 280;
}

/**
 * An X post intent. When the code and the link fit, the post is the code itself followed by
 * the link; otherwise it's the fallback text and the link.
 */
export function postIntent(code: string, url: string, fallback: string): string {
  const text = codeFitsWithLink(code) ? `${postText(code)}\n${url}` : `${fallback} ${url}`;
  return `https://x.com/intent/tweet?text=${encodeURIComponent(text)}`;
}
