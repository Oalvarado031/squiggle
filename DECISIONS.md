# Decisions

Numbered so code and commits can point at them. Newest last.

**1. Layout.** npm workspaces: `packages/core` (squiggle-core: lexer, parser, interpreter, renderers, tidy/squeeze, share links, vocabulary), `packages/cli` (the `squigglelang` npm package), `packages/vscode`, `site` (Cloudflare Worker + Vite client), `action/squiggle-render`, `examples/` (30 starters), `seeds/` (12 wall seeds). Core is TypeScript with no dependencies and is imported directly by the site, the Worker and the CLI bundle, so the studio, the CLI and the server run the same interpreter.

**2. The interpreter draws into a display list, not onto a canvas.** A frame is a flat list of ops (`dot`, `ring`, `box`, `line`, `path`, `shape`, `text`, `paper`) with a transform each. Two renderers consume it: Canvas2D (browser, OffscreenCanvas in a Web Worker, and `@napi-rs/canvas` in the CLI, all through the same `drawFrame`) and SVG (the Worker rasterizes it with resvg-wasm, since Workers have no canvas). Frame hashes are computed from the display list, so the determinism test doesn't depend on any rasterizer.

**3. A frame is a pure function of t.** Lines outside `every frame` run once; what they draw stays on the sheet as the bottom layer, and the values they store are where each frame starts. Every frame starts from a copy of those values, with `rand` restarted from the piece's seed. So scrubbing, exporting, the wall preview and the OG card always agree for any t, in any order. Only `when` blocks (input) change values that persist; they can't draw (they'd have nowhere to draw). Several `every frame` blocks run in order.

**4. rand starts from seed 1 for every piece, not from a hash of the code.** The spec asks that the same code always gives the same art; seeding from the code hash would also do that, but every keystroke in the studio (even in a comment) would reshuffle the whole piece. A fixed starting seed keeps the art steady while you edit; `seed n` picks another. `noise` uses a fixed permutation table.

**5. Determinism across engines.** Every coordinate and size in the display list is snapped to 1/256 px and every matrix entry to 1/65536 before drawing or hashing, so last-bit differences in `Math.sin`/`cos` between JavaScript engines can't change pixels or hashes. Randomness is sfc32 seeded through an integer hash; colors are integer RGB with alpha rounded to 1/1000.

**6. Budgets are counted in steps, not milliseconds.** Every statement and expression evaluation is one step. A frame (and each `when` run) may take 250,000 steps and draw 20,000 shapes; the lines outside `every frame` get 1,000,000 steps. Lists cap at 10,000 items, text at 2,000 chars, `make` nesting at 64, paths at 5,000 points, a piece at 20,000 chars. Steps rather than time because Cloudflare Workers freeze the clock during CPU work, and because a step budget gives the same verdict on every machine: a piece that runs in the studio runs on the server. The budget error names the innermost loop that was running.

**7. Small language choices.** Comments are `//` (`#` is taken by colors). `repeat n` without `as` names its counter `i` (a golf trick and less typing for beginners; nested repeats get their own `i`). Commands also accept `dot(1, 2, 3)`. Anywhere two numbers form x, y a point works. `%` is floored (always positive for positive divisors). `box` is centered on x, y. `dot`'s size is its radius. `keep` restores color and width as well as the transform. `make` blocks are hoisted. New names inside `make` are local; existing top-level names are shared. `paper`, `ember`, `sin` and other built-in names can't be reassigned (clear errors instead of confusing shadowing). Added beyond the spec: `shape` (filled polygon), `seed`, `say`, `pick`, `range`, `polar`, `dist`, `fade`, `rgb`, `atan`, `pi`, `mouse`, `tan`, `ceil`, `round`, `sign`, `min`, `max`, `sqrt`.

**8. Errors.** Parsing stops at the first problem. Every error carries line, column, an underline length, a plain message and, when there's a likely fix, a `try:` line. Unknown names get "did you mean" suggestions (edit distance with transpositions) and words from other tools (`circle`, `rect`, `rotate`, `background`…) map to Squiggle's names. Non-finite numbers skip the shape and leave a note instead of crashing.

**9. Post length counts like X.** The meter and "fits in a post" use X's weighting (most Latin text and punctuation 1, CJK and emoji 2) on the code with trailing spaces and blank edge lines removed. A post with the code and a link needs code ≤ 256 (X counts every link as 23 plus a newline).

**10. Share links carry the code.** `deflate-raw` + base64url in `/studio?c=…`. No server state; the Worker can still render an OG card for any share link because the code is in the URL.

**11. tidy and squeeze work on tokens after a full parse.** tidy keeps comments and single blank lines. squeeze removes comments and spaces, shortens numbers (`0.30` → `.3`), colors (`#15130f` → `ink`, `#ff0000` → `#f00`), renames long names to free short ones (never to `i`, `t` or a built-in), and drops `as i`. The squeezed code is accepted only if its frame hashes at five times (and its `say` output) match the original; otherwise it falls back step by step.

**12. Text in pieces uses Fraunces Regular**, the same static TTF in the browser worker, the CLI and the server renderer, so `write` looks the same everywhere.

**13. CLI stack.** `@napi-rs/canvas` (prebuilt for macOS, Linux, Windows, so `npx` needs no build tools), `gifenc` (bundled) for GIF, `h264-mp4-encoder` (WASM) for MP4. Clips render offline at a fixed fps (`t = frame / fps`), so the same command gives the same file. A starter name works wherever a file path does (`squiggle render tide`).
