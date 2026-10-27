// A basic text filter for titles, handles and the words inside pinned code. It catches
// the obvious (slurs, explicit words, spelled with the usual swaps); people can still
// report anything it misses, and pieces can be hidden.

const BLOCKED = [
  // kept to words with no innocent readings (so no "tits", "cock" or "spic": blue tits, cocky, spices)
  'nigger', 'nigga', 'faggot', 'fag', 'retard', 'tranny', 'kike', 'chink', 'gook', 'wetback',
  'cunt', 'whore', 'slut', 'rape', 'rapist', 'porn', 'jizz', 'dick', 'pussy', 'penis', 'vagina', 'boobs',
  'nazi', 'hitler', 'kkk', 'heil', 'genocide', 'pedo', 'pedophile', 'nsfw', 'onlyfans', 'fuck', 'motherfucker', 'shit', 'bitch',
  'killyourself', 'kys',
];

const SWAPS: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i', '|': 'i', '+': 't' };

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[013457@$!|+]/g, (c) => SWAPS[c] ?? c);
}

const WORD = new RegExp(`(^|[^a-z])(${BLOCKED.join('|')})(e?s|ed|ing|er|ers|[a-z]?y)?(?=[^a-z]|$)`);
// Also checked with spaces and dots squeezed out ("f u c k"). Only words that can't hide inside innocent ones.
const SQUASHED = ['nigger', 'faggot', 'killyourself', 'fuck'];

/** Returns the offending word, or null when the text is fine. */
export function blockedWord(text: string): string | null {
  const n = normalize(text);
  const m = WORD.exec(n);
  if (m) return m[2];
  const squashed = n.replace(/[^a-z]/g, '');
  for (const w of SQUASHED) if (squashed.includes(w)) return w;
  return null;
}
