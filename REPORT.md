# Report

Status as of 2026-10-27.

| Part | State |
|---|---|
| Language (lexer, parser, interpreter, errors, limits) | Done, 409 tests passing |
| Renderers (Canvas2D, SVG) | Done |
| tidy / squeeze / share links / post length | Done |
| CLI (`render` PNG/MP4/GIF, `shell`, `tidy`, `squeeze`, `check`, `link`, `examples`, `sheet`) | Done locally; not published to npm (owner's call) |
| 30 starters + 12 seeds | In progress |
| VS Code extension | In progress |
| Studio, wall, learn, reference, Worker | Not started |
| Deploy | Waiting on `wrangler login` with the DRY RUN account |

## How to check

```
npm install
npm test                          # core suite + determinism snapshot
npm run build:cli
node packages/cli/bin/squiggle.js render examples/orbit-garden.sqg --out orbit.png
```
