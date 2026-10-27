# The Squiggle language

A Squiggle program is a list of drawing instructions, one per line. Indentation makes blocks. Every program draws on a 512 × 512 sheet with the origin in the center and y pointing up, so `dot 0, 0, 10` sits in the middle and `dot 0, 200, 10` sits near the top.

```
paper ink
every frame
  repeat 48 as i
    a = i / 48 * turn + t * 0.3
    dot cos(a) * 140, sin(a * 2) * 90, 3, hue(i * 7)
```

## Lines and blocks

- One instruction per line. Commands take their values after a space, separated by commas: `dot 0, 0, 20`. (`dot(0, 0, 20)` also works.)
- A line that ends with a block word (`every frame`, `repeat`, `for`, `if`, `else`, `when`, `make`, `keep`) owns the indented lines under it. Two spaces per level is the house style; any consistent indent works, tabs and spaces can't be mixed.
- Inside `( )` and `[ ]` a value can run over several lines.
- `//` starts a comment.

## Values

| kind | how to write it |
|---|---|
| number | `3`, `0.5`, `.5`, `-12` |
| text | `"hello"` (`\"` and `\n` inside) |
| list | `[1, 2, 3]`, `[]`; items with `list[0]` (from 0; negative counts from the end) |
| point | `(x, y)`; parts with `p.x`, `p.y` |
| color | palette names, `#e4572e`, `#e4572e80` (with alpha), `hue(200)`, `mix(a, b, k)`, `fade(c, k)`, `rgb(r, g, b)` |
| true/false | `true`, `false`, from tests like `a < b` |

Arithmetic: `+ - * / %` and `^` (power). `%` always wraps into the positive range, so `-1 % 5` is `4`. Points add, subtract, and scale by numbers. `+` joins lists (`list + [item]`) and turns anything into text when one side is text. Tests: `== != < > <= >=`, combined with `and`, `or`, `not`.

Storing: `name = value`, plus `+=`, `-=`, `*=`, `/=`.

## Palette

`ink` `paper` `bone` `chalk` `coal` `ash` `ember` `rust` `clay` `ochre` `sand` `moss` `leaf` `sea` `sky` `night` `plum` `rose` `lilac`

## Commands

Shapes take an optional color as their last value; otherwise they use the current `color`. Anywhere two numbers make an x, y pair, a point works too: `dot p, 4`.

| command | what it does |
|---|---|
| `dot x, y, size [, color]` | filled circle; size is the radius |
| `ring x, y, size [, color]` | outlined circle, stroked with the current `width` |
| `box x, y, w, h [, color]` | filled rectangle centered on x, y |
| `line x1, y1, x2, y2 [, color]` | straight stroke |
| `path points [, color]` | stroke through a list of points |
| `shape points [, color]` | filled polygon |
| `write text, x, y [, size] [, color]` | text centered on x, y (size 18 by default) |
| `paper color` | covers the whole sheet with a color |
| `color c` | color for the shapes after it |
| `width w` | stroke width for ring, line and path (2 at the start) |
| `move x, y` | shift everything after it |
| `spin a` | rotate everything after it (radians; `turn` is a full turn) |
| `grow s [, sy]` | scale everything after it |
| `seed n` | restart `rand` from seed n |
| `say value` | print a value to the console |

## Blocks

```
every frame          // runs for every frame; t is the time in seconds
repeat n [as i]      // n times, i counts from 0 (named i when "as" is left out)
for item in list     // once per item
if test / else if test / else
keep                 // undoes move, spin, grow, color and width at the end
make name a, b       // your own command; the last line is its result
when key "space"     // runs on a key press ("space", "enter", "left", "right", "up", "down", letters, digits)
when click           // runs on a click or tap; mouse holds where
```

`every frame`, `when` and `make` go at the top level. A program without `every frame` draws a still.

### How frames work

Everything outside `every frame` runs once, first. What it draws stays on the sheet under every frame, and the values it stores are where each frame starts. Each frame starts again from those values, so a frame is a pure function of `t`: scrubbing, exporting and server previews always agree. To keep a change between frames, make it in a `when` block.

`make` blocks can be used before the line that defines them. Inside a `make`, new names are local; names that already exist at the top level are shared.

## Built-ins

Math: `sin cos tan atan(y, x) sqrt abs floor ceil round min max sign lerp(a, b, k) clamp(x, lo, hi) ease(k) noise(x, y, z)`.
Randomness: `rand` (0 to 1), `rand(n)`, `rand(a, b)`, `pick(list)`. Every piece starts from seed 1 (and each frame starts from the same seed), so the same code always gives the same art; `seed n` picks another.
Points: `polar(r, a)`, `dist(p, q)`.
Lists: `len(x)`, `range(n)`.
Colors: `hue(h [, s, l])`, `mix(a, b, k)`, `fade(c, k)`, `rgb(r, g, b [, a])`.
Values: `t` (seconds), `turn` (2π), `pi`, `mouse` (pointer position as a point).

## Limits

A frame can take 250,000 steps and draw 20,000 shapes; the lines outside `every frame` get 1,000,000 steps. Lists hold up to 10,000 items, text up to 2,000 characters, `make` can nest 64 calls deep, and a piece can be up to 20,000 characters. A piece that hits a limit stops with a note saying which line.

## Determinism

Same code and same `t` give the same frame everywhere: in the studio, the CLI and the Worker that renders the wall. Every coordinate is snapped to 1/256 of a pixel before drawing, randomness comes from Squiggle's own seeded generator, and `noise` uses a fixed table. The test suite hashes frames at t = 0, 1 and 2 for every starter piece.
