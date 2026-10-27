# squigglelang

The command line for [Squiggle](https://squiggle.oiaj2341.workers.dev), a language where every program is a short moving drawing that fits in one post.

```
npx squigglelang render piece.sqg --out piece.png
npx squigglelang render piece.sqg --seconds 6 --out piece.mp4   # or .gif
```

Works on macOS, Linux and Windows with nothing to compile (it draws with `@napi-rs/canvas` and encodes MP4 with a WebAssembly H.264 encoder).

```
squiggle render <piece.sqg>… [--out file] [--t 1] [--size 1024]
squiggle render <piece.sqg> --seconds 6 [--out clip.mp4|clip.gif] [--fps 30]
squiggle shell                  try values and make blocks line by line
squiggle tidy <piece.sqg> [-w]  lay the code out the standard way
squiggle squeeze <piece.sqg> [-w]
                                shorten it without changing the art, print the count
squiggle check <piece.sqg>…     run each piece and report problems
squiggle link <piece.sqg>       print a studio link with the code inside
squiggle examples [dir]         list the starter pieces, or write them all to dir
squiggle sheet <piece.sqg>… --out sheet.png
```

A starter's name works wherever a file path does: `squiggle render tide --out tide.png`.

Stills are drawn at t = 1 for pieces that move (the same moment the wall shows). Clips are rendered offline at a fixed frame rate, so the same command always writes the same file.

Install it for good with `npm i -g squigglelang`. MIT licensed.
