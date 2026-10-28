export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  KV: KVNamespace;
  ASSETS: Fetcher;
  TOKEN_MINT?: string;
  X_URL?: string;
  GITHUB_URL?: string;
  /** when set, requests to the workers.dev address redirect here */
  CANONICAL_HOST?: string;
  /** secret: salts IP hashes so raw IPs are never stored */
  IP_SALT?: string;
  /** secret: lets the seed script pin without rate limits */
  ADMIN_TOKEN?: string;
}
