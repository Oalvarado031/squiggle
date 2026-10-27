/** Where the studio lives; share links and "Open in Squiggle Studio" point here. */
export const SITE_URL = 'https://squiggle.oiaj2341.workers.dev';

export async function studioLink(code: string, base: string = SITE_URL): Promise<string> {
  const { encodeCode } = await import('./share.ts');
  return `${base.replace(/\/$/, '')}/studio?c=${await encodeCode(code)}`;
}
