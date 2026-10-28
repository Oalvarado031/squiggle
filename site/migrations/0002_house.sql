-- House pieces (seeds, prompt starters) are credited to Squiggle itself, never to an X handle.
ALTER TABLE pieces ADD COLUMN house INTEGER NOT NULL DEFAULT 0;
UPDATE pieces SET house = 1, handle = NULL WHERE handle = 'squiggle';
