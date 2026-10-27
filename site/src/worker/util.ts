export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

export function problem(status: number, message: string, extra: Record<string, unknown> = {}): Response {
  return json({ message, ...extra }, status);
}

export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
export function newId(length = 8): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
}

export function clientIp(req: Request): string {
  return req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? '0.0.0.0';
}
