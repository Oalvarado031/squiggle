# Report

## v1.0.1: fixes from the live review (2026-10-28)

| Done when | State |
|---|---|
| `npx squigglelang render` works on three OSes, or home no longer shows the command | **Home no longer shows it**: "CLI coming soon" until npm has the package, then the command appears by itself (DECISIONS #35). The publish workflow (provenance, then `npx squigglelang render examples/tide.sqg` on Linux, macOS and Windows) is ready and waits for the `NPM_TOKEN` secret. |
| No trace of the old GitHub username in the site, packages or repo metadata | **Done.** Links come from `squiggle.config.json` (DECISIONS #31). 0 matches in tracked files, the built site, the CLI and action bundles, the `.vsix`, and 670 KB of live pages, scripts and downloads. CI fails if one comes back. |
| Seed pieces don't link to accounts we don't own | **Done.** The 12 seeds (and the 3 prompt pieces) are house pieces: "by squiggle", no link while `X_URL` is empty, OG cards redrawn (DECISIONS #32). |
| The weather prompt shows 3 entries | **Done.** downpour, lightning, morning fog (DECISIONS #33). |
| "Post on X" carries the code when it fits | **Done** on piece pages and in the studio's new "pinned" view: downpour and lightning post their code and the link; paper boat (276) keeps the title text (DECISIONS #34). |
| No console errors, checked at 375 px | **Done.** The CSP allows Cloudflare's beacon in `script-src` and `connect-src` (DECISIONS #30). Checked in Google Chrome at 375 px on home, studio, wall, the prompt tab, three piece pages, learn and reference: 0 errors, no sideways scroll. |

After the deploy: `npm test` 563 passed; Playwright against https://squigglee.online 17 of 17 (desktop and 375 px); test pieces hidden afterwards.

Status as of 2026-10-28 (UTC). **Live: https://squigglee.online** (www and squiggle.oiaj2341.workers.dev redirect there) · Source: the public GitHub repository set as `repoUrl` in `squiggle.config.json` (MIT).

| Part | State |
|---|---|
| Language: lexer, parser, interpreter, errors, limits | Done. 547 tests pass (493 language, 54 Worker API); frame hashes pinned at t = 0, 1, 2 for all 42 pieces |
| Studio: CodeMirror editor, live canvas in a Web Worker, post meter, share links, PNG, MP4/GIF clip, pin | **Live**; MP4 export checked in Chromium and Google Chrome |
| Wall: pin, server renders, previews playing in view, likes, new / top today / top week, remix family, weekly prompt, OG cards | **Live**, with the 12 seed pieces pinned as @squiggle |
| Learn (10 steps) and reference | **Live**; all ten steps and every reference example run in the e2e suite |
| 30 starters, 12 seeds, 3 weather prompt pieces | Done; all fit in a post; frame hashes pinned for all 45 |
| CLI `squigglelang` | Done. CI renders PNG, MP4 and GIF through `npx` from the packed tarball on Ubuntu, macOS and Windows. **Not published to npm** (owner's decision): until it is, `npx squigglelang` from the registry and the install scripts won't find it |
| Install scripts | Served at `/install.sh` and `/install.ps1` (they only run `npm i -g squigglelang`) |
| VS Code extension | `.vsix` (16.5 KB) at `/downloads/squiggle.vsix`; installs in VS Code (checked with a throwaway profile). Not on the Marketplace: that needs a publisher account and token |
| GitHub Action `squiggle-render` | Done; CI runs it on the 30 starters |
| Launch assets | 12 seeds on the wall; `launch/squiggle-20s-vertical.mp4` and `launch/squiggle-20s-horizontal.mp4` (20 s, 30 fps); `docs/hero.gif` |

## Production checks (after the last deploy)

- **Playwright against https://squigglee.online: 12 of 12 pass** (desktop, plus 375 px for the studio, a learn goal and all ten learn steps). Typing with plain errors and the underline, runaway-loop note, share link → code restored and `og:image` points at `/og/c/…`, PNG and 6 s clip downloads, pin → piece page → like → remix → wall, learn goals on desktop and 375 px, all ten learn steps, reference, night print theme. The test piece was hidden afterwards.
- **Lighthouse (mobile preset) on https://squigglee.online: home and /studio score 100 in performance, accessibility, best practices and SEO** (LCP 1.0 s and 1.5 s).
- No console errors and no horizontal scroll at 1440 px and 375 px on home, studio, wall, a piece page, learn, reference and the 404.
- HTTPS certificate issued by Google Trust Services through Cloudflare (renewed automatically); `www` and the workers.dev address answer with 301 to squigglee.online, the API stays reachable on both.
- OG cards: fetched as `Twitterbot/1.0`, a piece page carries `og:title`, `og:description`, `og:image` (1200 × 630 PNG), `twitter:card=summary_large_image`, `twitter:image` and `og:url`; the image answers 200 `image/png`. X retired its public card validator, so the last check is pasting a link into the post composer.
- Pinning in production renders the still and the 45-frame preview into R2 in about 1.5 s per piece.
- CI on GitHub: all six jobs green (tests, pack, npx on three OSes, the action).

## Local checks

- `npm test`: 547 passed (lexer, parser, interpreter, errors, limits, tidy/squeeze, share links, renderers, reference examples, determinism for 42 pieces, Worker API on Node's SQLite).
- `npm run typecheck`: clean (core, client, Worker).

## For the owner

- **CA chip:** set `TOKEN_MINT` in `site/wrangler.jsonc` (`vars`) and redeploy (`npm run deploy`); empty means the chip shows "CA" and does nothing.
- **Links (repository, X account, author):** edit `squiggle.config.json`, run `npm run sync-config`, then `npm run deploy`. Empty values hide the link. Today the repository and X account are empty, so the footer shows neither.
- **npm (squigglelang):** create an npm automation token, add it to the GitHub repository as the `NPM_TOKEN` secret, then run **Actions → publish squigglelang → Run workflow** (or push a tag `cli-v0.1.0`). It publishes with provenance and checks `npx squigglelang render examples/tide.sqg` on Linux, macOS and Windows. The home page switches from "CLI coming soon" to the command by itself within 10 minutes. Publishing by hand (`cd packages/cli && npm run build && npm publish --access public`) also works, without provenance.
- **Analytics:** Cloudflare injects its cookie-free Web Analytics on the custom domain (the CSP allows it). Turn it off in the dashboard under Web Analytics if you don't want it.
- **Weekly prompt:** the rotation starts with "weather" this week; to choose a theme for a week, insert into D1 `prompts (week, theme)`, e.g. `('2026-W45', 'machines')`.
- **Moderation:** `POST /api/admin/hide {"id": "…"}` with `Authorization: Bearer <.admin-token>` hides a piece (`"hidden": false` brings it back).

## Known gaps

- `write` has no text-width measurement or alignment choice (asked for while writing the starters).
- Indentation counts toward the 280; `squeeze` uses one-space indents.
- The extension uses Node's zlib, so it runs in desktop VS Code, not vscode.dev.
