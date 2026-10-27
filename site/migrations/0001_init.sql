-- Pieces pinned to the wall. Media (still, preview, OG card) lives in R2 under p/<id>/.
CREATE TABLE pieces (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  title TEXT NOT NULL,
  handle TEXT,
  chars INTEGER NOT NULL,
  animated INTEGER NOT NULL,
  interactive INTEGER NOT NULL DEFAULT 0,
  parent_id TEXT,
  prompt_week TEXT,
  likes INTEGER NOT NULL DEFAULT 0,
  remixes INTEGER NOT NULL DEFAULT 0,
  preview_frames INTEGER NOT NULL,
  preview_fps INTEGER NOT NULL,
  preview_cols INTEGER NOT NULL,
  preview_cell INTEGER NOT NULL,
  ip_hash TEXT NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX pieces_new ON pieces (hidden, created_at DESC);
CREATE INDEX pieces_parent ON pieces (parent_id, created_at DESC);
CREATE INDEX pieces_prompt ON pieces (prompt_week, likes DESC);
CREATE INDEX pieces_ip ON pieces (ip_hash, created_at DESC);

-- One like per browser per piece; ip_hash caps likes from one network.
CREATE TABLE likes (
  piece_id TEXT NOT NULL,
  browser_id TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (piece_id, browser_id)
);
CREATE INDEX likes_recent ON likes (created_at, piece_id);
CREATE INDEX likes_ip ON likes (piece_id, ip_hash);

-- Optional overrides for the weekly prompt (otherwise it comes from the built-in rotation).
CREATE TABLE prompts (
  week TEXT PRIMARY KEY,
  theme TEXT NOT NULL
);

-- Top three entries of a closed prompt week, frozen when the week ends.
CREATE TABLE prompt_winners (
  week TEXT NOT NULL,
  rank INTEGER NOT NULL,
  piece_id TEXT NOT NULL,
  likes INTEGER NOT NULL,
  PRIMARY KEY (week, rank)
);
CREATE INDEX prompt_winners_piece ON prompt_winners (piece_id);
