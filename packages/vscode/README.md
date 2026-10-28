# Squiggle for VS Code

Squiggle is a small creative-coding language: write a few lines, watch them move, and share the whole piece in one post. Every program draws on a 512 × 512 sheet, and a share link carries the code itself, so there's no account or server in the way.

This extension adds Squiggle support for `.sqg` files.

```
paper ink
every frame
  repeat 48 as i
    a = i / 48 * turn + t * 0.3
    dot cos(a) * 140, sin(a * 2) * 90, 3, hue(i * 7)
```

## Features

- **Highlighting** for commands, blocks, built-in functions, palette colors, hex colors, numbers, text and comments. The grammar is generated from Squiggle's own vocabulary, so it always matches the language.
- **Snippets** for every block (`every frame`, `repeat`, `for`, `if` / `else`, `make`, `keep`, `when key`, `when click`), one for each shape (`dot`, `ring`, `box`, `line`, `path`, `shape`, `write`) with a tab stop per value, and `piece`, which sets up a small animated piece to start from.
- **Indentation that follows the blocks.** Press Enter after a block line such as `every frame` or `repeat 12 as i` and the next line is indented; `else` steps back out on its own. Blocks fold by indentation.
- **Post counter** in the status bar. `214 / 280` counts characters the way X does, so you can see whether a piece fits in a post. It's highlighted when it doesn't. Click it to open the piece in the studio.
- **Open in Squiggle Studio** sends the selection, or the whole file when nothing is selected, to the studio in your browser, where it runs, records and shares.

## Command

| Command | Where | What it does |
|---|---|---|
| `Squiggle: Open in Squiggle Studio` | Editor title bar, right-click menu, Command Palette, status bar counter | Opens the selected code (or the whole file) in Squiggle Studio. The code travels inside the link, compressed, exactly like a share link. Links can hold about 8,000 characters, which fits pieces far longer than a post. |

## Setting

| Setting | Default | What it does |
|---|---|---|
| `squiggle.studioUrl` | `https://squigglee.online` | The Squiggle site that **Open in Squiggle Studio** uses, without `/studio`. Point it at a local copy while working on Squiggle itself. |

New `.sqg` files use two-space indents, Squiggle's house style. Change that per language with `"[squiggle]": { "editor.tabSize": 4 }`.

## Learn more

- Squiggle Studio: [squigglee.online/studio](https://squigglee.online/studio)
- The language in one page: [LANGUAGE.md](https://github.com/Oalvarado031/squiggle/blob/main/LANGUAGE.md)
- Source and issues: [github.com/Oalvarado031/squiggle](https://github.com/Oalvarado031/squiggle)
