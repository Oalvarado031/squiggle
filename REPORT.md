# Report

Status as of 2026-10-27. Repo: https://github.com/Oalvarado031/squiggle (public, MIT).

| Part | State |
|---|---|
| Language: lexer, parser, interpreter, errors, limits | Done. 547 tests pass (493 language, 54 Worker API), determinism hashes pinned for all 42 pieces |
| Studio: CodeMirror editor, live canvas in a Web Worker, post meter, share links, PNG, MP4/GIF clip, pin | Done, checked locally in Chromium and Google Chrome (both export MP4) |
| Wall: pin, server renders, previews, likes, sorts, remix family, weekly prompt, OG cards | Done locally (wrangler dev with local D1/R2/KV) |
| Learn (10 steps) and reference | Done; every step's goal and every reference example run in the e2e suite |
| 30 starters, 12 seeds | Done; all fit in a post |
| CLI `squigglelang` | Done. CI renders PNG, MP4 and GIF through `npx` from the packed tarball on Ubuntu, macOS and Windows. **Not published to npm** (owner's decision) |
| Install scripts | `/install.sh` and `/install.ps1`; they work once the package is on npm |
| VS Code extension | `.vsix` built (16.5 KB) and served at `/downloads/squiggle.vsix`; not on the marketplace (needs a publisher account) |
| GitHub Action `squiggle-render` | Done; CI runs it on the 30 starters |
| README GIF | `docs/hero.gif` |
| Launch video | `launch/squiggle-20s-vertical.mp4` and `-horizontal.mp4` (20 s, 30 fps, drawn with the real interpreter); re-rendered once the production URL is confirmed |
| Deploy to Cloudflare | **Waiting on `wrangler login` with the DRY RUN account.** `node scripts/deploy.mjs --account <id>` then `node scripts/seed.mjs <url>` |

## Checks run

- `npm test`: 547 passed (lexer, parser, interpreter, errors, limits, tidy/squeeze, share links, renderers, reference examples, determinism for 42 pieces, Worker API on Node's SQLite).
- `npm run typecheck`: clean (core, client, Worker).
- `npm run e2e` (Playwright, local Worker): 11 passed: typing and plain errors, runaway loop note, share links and their OG tag, PNG and clip download, pin → piece page → like → remix → wall, learn goals on desktop and phone, all 10 learn steps, reference, night print theme.
- No console errors and no horizontal scroll at 1440 px and 375 px on home, studio, wall, a piece, learn, reference and the 404.
- Lighthouse (mobile preset, local Worker, which is slower than the edge): home 94 to 99, studio 88 to 98 depending on the run. To be re-measured in production.
- CI on GitHub: all six jobs green (tests, pack, npx on three OSes, the action).

## Known gaps

- `write` has no text-width measurement or alignment choice (asked for while writing the starters).
- Indentation counts toward the 280; `squeeze` uses one-space indents.
- The extension uses Node's zlib, so it runs in desktop VS Code, not vscode.dev.
