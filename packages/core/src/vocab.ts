// The whole Squiggle vocabulary in one place. The parser, interpreter, error hints,
// studio autocomplete, /reference and the editor grammars all read from here.

export const KEYWORDS = [
  'every', 'frame', 'repeat', 'as', 'for', 'in', 'if', 'else', 'when', 'key', 'click', 'make', 'keep',
  'and', 'or', 'not', 'true', 'false',
] as const;

/** Words that start a statement block. */
export const BLOCK_WORDS = ['every', 'repeat', 'for', 'if', 'else', 'when', 'make', 'keep'] as const;

export type Group = 'shapes' | 'style' | 'transforms' | 'blocks' | 'values' | 'math' | 'color' | 'lists' | 'points' | 'other';

export interface Entry {
  name: string;
  group: Group;
  /** how you write it, e.g. "dot x, y, size [, color]" */
  usage: string;
  summary: string;
  /** a small runnable piece for /reference */
  example: string;
}

export interface CommandSpec extends Entry {
  /** the numbers it needs, in order (points count as two numbers) */
  numbers: string[];
  /** extra trailing values it accepts */
  optional?: string[];
}

export const COMMANDS: CommandSpec[] = [
  {
    name: 'dot', group: 'shapes', numbers: ['x', 'y', 'size'], optional: ['color'],
    usage: 'dot x, y, size [, color]',
    summary: 'A filled circle. size is the radius in pixels.',
    example: 'paper bone\ndot 0, 0, 90, ember\ndot 60, 50, 24, ink',
  },
  {
    name: 'ring', group: 'shapes', numbers: ['x', 'y', 'size'], optional: ['color'],
    usage: 'ring x, y, size [, color]',
    summary: 'An outlined circle, drawn with the current width.',
    example: 'width 6\nrepeat 6 as i\n  ring 0, 0, 20 + i * 30, mix(ember, sky, i / 5)',
  },
  {
    name: 'box', group: 'shapes', numbers: ['x', 'y', 'w', 'h'], optional: ['color'],
    usage: 'box x, y, w, h [, color]',
    summary: 'A filled rectangle centered on x, y.',
    example: 'box 0, 0, 260, 160, moss\nbox 0, 0, 120, 220, fade(ember, 0.8)',
  },
  {
    name: 'line', group: 'shapes', numbers: ['x1', 'y1', 'x2', 'y2'], optional: ['color'],
    usage: 'line x1, y1, x2, y2 [, color]',
    summary: 'A straight stroke from one point to another.',
    example: 'width 4\nrepeat 24 as i\n  line -200, i * 16 - 184, 200, 184 - i * 16, hue(i * 12)',
  },
  {
    name: 'path', group: 'shapes', numbers: [], optional: ['color'],
    usage: 'path points [, color]',
    summary: 'A stroke through a list of points.',
    example: 'pts = []\nrepeat 80 as i\n  pts = pts + [(i * 6 - 240, sin(i / 6) * 80)]\nwidth 5\npath pts, ember',
  },
  {
    name: 'shape', group: 'shapes', numbers: [], optional: ['color'],
    usage: 'shape points [, color]',
    summary: 'A filled shape whose corners are a list of points.',
    example: 'shape [(0, 160), (-150, -110), (150, -110)], ochre',
  },
  {
    name: 'write', group: 'shapes', numbers: [], optional: ['size', 'color'],
    usage: 'write text, x, y [, size] [, color]',
    summary: 'Text centered on x, y. size is the letter height in pixels (18 if you leave it out).',
    example: 'paper ink\nwrite "hello", 0, 20, 64, bone\nwrite "from squiggle", 0, -40, 22, ember',
  },
  {
    name: 'paper', group: 'style', numbers: [],
    usage: 'paper color',
    summary: 'Covers the whole sheet with a color. Use it first to set the background.',
    example: 'paper night\ndot 0, 0, 60, ochre',
  },
  {
    name: 'color', group: 'style', numbers: [],
    usage: 'color c',
    summary: 'Sets the color for every shape after it.',
    example: 'color sea\ndot -80, 0, 50\ncolor ember\ndot 80, 0, 50',
  },
  {
    name: 'width', group: 'style', numbers: ['w'],
    usage: 'width w',
    summary: 'Sets the stroke thickness for ring, line and path.',
    example: 'repeat 5 as i\n  width i * 4 + 1\n  line -180, i * 70 - 140, 180, i * 70 - 140',
  },
  {
    name: 'move', group: 'transforms', numbers: ['x', 'y'],
    usage: 'move x, y',
    summary: 'Shifts everything drawn after it.',
    example: 'move 100, 60\ndot 0, 0, 40, ember',
  },
  {
    name: 'spin', group: 'transforms', numbers: ['angle'],
    usage: 'spin angle',
    summary: 'Turns everything drawn after it around the current origin. Angles are in radians: a full turn is turn.',
    example: 'repeat 12\n  spin turn / 12\n  box 120, 0, 60, 10, ink',
  },
  {
    name: 'grow', group: 'transforms', numbers: ['s'], optional: ['sy'],
    usage: 'grow s [, sy]',
    summary: 'Scales everything drawn after it. Give two values to stretch.',
    example: 'grow 2, 1\nring 0, 0, 60',
  },
  {
    name: 'seed', group: 'other', numbers: ['n'],
    usage: 'seed n',
    summary: 'Starts rand over from a new seed. Every piece starts at seed 1, so the same code always gives the same art.',
    example: 'seed 7\nrepeat 40\n  dot rand(-220, 220), rand(-220, 220), rand(4, 16), ember',
  },
  {
    name: 'say', group: 'other', numbers: [],
    usage: 'say value',
    summary: 'Prints a value to the console under the editor (and in the shell).',
    example: 'say 6 * 7\ndot 0, 0, 42',
  },
];

export const BLOCKS: Entry[] = [
  {
    name: 'every frame', group: 'blocks', usage: 'every frame\n  …',
    summary: 'Runs its lines for every frame. t is the time in seconds. Without it, the piece is a still.',
    example: 'every frame\n  dot cos(t) * 150, sin(t * 2) * 90, 30, ember',
  },
  {
    name: 'repeat', group: 'blocks', usage: 'repeat n [as i]\n  …',
    summary: 'Runs its lines n times, counting i from 0. Leave out "as" and the count is still called i.',
    example: 'repeat 9 as i\n  dot i * 50 - 200, 0, 8 + i * 2, hue(i * 30)',
  },
  {
    name: 'for', group: 'blocks', usage: 'for item in list\n  …',
    summary: 'Runs its lines once for each item of a list.',
    example: 'for c in [ember, ochre, moss, sea]\n  move 0, -50\n  box 0, 125, 300, 40, c',
  },
  {
    name: 'if', group: 'blocks', usage: 'if test\n  …\nelse\n  …',
    summary: 'Runs its lines only when the test holds. else (or else if) catches the other case.',
    example: 'repeat 10 as i\n  if i % 2 == 0\n    dot i * 44 - 198, 0, 18, ember\n  else\n    ring i * 44 - 198, 0, 18, ink',
  },
  {
    name: 'keep', group: 'blocks', usage: 'keep\n  …',
    summary: 'Whatever move, spin, grow, color or width happens inside is undone at the end.',
    example: 'keep\n  move -100, 0\n  color ember\n  dot 0, 0, 50\ndot 100, 0, 50',
  },
  {
    name: 'make', group: 'blocks', usage: 'make name a, b\n  …',
    summary: 'Defines your own command. The last line is its result, so it works as a function too.',
    example: 'make petal a\n  keep\n    spin a\n    box 0, 80, 40, 140, fade(ember, 0.7)\nrepeat 8\n  petal i * turn / 8',
  },
  {
    name: 'when key', group: 'blocks', usage: 'when key "space"\n  …',
    summary: 'Runs when a key is pressed (keys: "space", "enter", arrows like "left", letters and digits). Change values here; draw in every frame.',
    example: 'n = 3\nwhen key "space"\n  n = n % 9 + 1\nevery frame\n  repeat n\n    dot (i - (n - 1) / 2) * 50, 0, 18, ember',
  },
  {
    name: 'when click', group: 'blocks', usage: 'when click\n  …',
    summary: 'Runs when the canvas is clicked or tapped; mouse holds where.',
    example: 'at = (0, 0)\nfrom = -9\nwhen click\n  at = mouse\n  from = t\nevery frame\n  ring at.x, at.y, (t - from) * 240, ember',
  },
];

export interface FnSpec extends Entry {
  /** min and max argument counts */
  arity: [number, number];
}

export const FUNCTIONS: FnSpec[] = [
  { name: 'sin', group: 'math', arity: [1, 1], usage: 'sin(a)', summary: 'Sine of an angle in radians, between -1 and 1.', example: 'repeat 64 as i\n  dot i * 7 - 220, sin(i / 5) * 120, 5, ink' },
  { name: 'cos', group: 'math', arity: [1, 1], usage: 'cos(a)', summary: 'Cosine of an angle in radians, between -1 and 1.', example: 'repeat 64 as i\n  dot i * 7 - 220, cos(i / 5) * 120, 5, sea' },
  { name: 'tan', group: 'math', arity: [1, 1], usage: 'tan(a)', summary: 'Tangent of an angle in radians.', example: 'repeat 60 as i\n  dot i * 7 - 210, clamp(tan(i / 12) * 40, -200, 200), 4, ember' },
  { name: 'atan', group: 'math', arity: [2, 2], usage: 'atan(y, x)', summary: 'The angle pointing from the center to (x, y).', example: 'a = atan(120, 160)\nwidth 4\nline 0, 0, cos(a) * 200, sin(a) * 200, ember\ndot 160, 120, 10' },
  { name: 'sqrt', group: 'math', arity: [1, 1], usage: 'sqrt(x)', summary: 'Square root.', example: 'repeat 40 as i\n  dot i * 11 - 210, sqrt(i) * 40 - 120, 6, moss' },
  { name: 'abs', group: 'math', arity: [1, 1], usage: 'abs(x)', summary: 'Drops the minus sign.', example: 'repeat 41 as i\n  dot i * 10 - 200, abs(i - 20) * 9 - 90, 6, plum' },
  { name: 'floor', group: 'math', arity: [1, 1], usage: 'floor(x)', summary: 'Rounds down to a whole number.', example: 'repeat 50 as i\n  dot i * 9 - 220, floor(i / 10) * 50 - 100, 5, ink' },
  { name: 'ceil', group: 'math', arity: [1, 1], usage: 'ceil(x)', summary: 'Rounds up to a whole number.', example: 'repeat 50 as i\n  dot i * 9 - 220, ceil(i / 10) * 50 - 125, 5, rust' },
  { name: 'round', group: 'math', arity: [1, 1], usage: 'round(x)', summary: 'Rounds to the nearest whole number.', example: 'repeat 50 as i\n  dot i * 9 - 220, round(sin(i / 8) * 3) * 40, 5, sea' },
  { name: 'min', group: 'math', arity: [1, 99], usage: 'min(a, b, …)', summary: 'The smallest value.', example: 'repeat 50 as i\n  dot i * 9 - 220, min(sin(i / 6) * 150, 60), 5, ember' },
  { name: 'max', group: 'math', arity: [1, 99], usage: 'max(a, b, …)', summary: 'The largest value.', example: 'repeat 50 as i\n  dot i * 9 - 220, max(sin(i / 6) * 150, -60), 5, moss' },
  { name: 'sign', group: 'math', arity: [1, 1], usage: 'sign(x)', summary: '-1, 0 or 1, following the sign of x.', example: 'repeat 50 as i\n  dot i * 9 - 220, sign(sin(i / 5)) * 80, 5, ink' },
  { name: 'lerp', group: 'math', arity: [3, 3], usage: 'lerp(a, b, k)', summary: 'The value k of the way from a to b (k from 0 to 1). Works on numbers, points and colors.', example: 'repeat 11 as i\n  dot lerp(-200, 200, i / 10), 0, 14, lerp(sky, ember, i / 10)' },
  { name: 'clamp', group: 'math', arity: [1, 3], usage: 'clamp(x, low, high)', summary: 'Keeps x between low and high (0 and 1 if you leave them out).', example: 'repeat 50 as i\n  dot i * 9 - 220, clamp(sin(i / 6) * 200, -80, 80), 5, ochre' },
  { name: 'ease', group: 'math', arity: [1, 1], usage: 'ease(k)', summary: 'Smooths k from 0 to 1 so motion starts and stops gently.', example: 'every frame\n  k = ease(t % 2 / 2)\n  dot lerp(-180, 180, k), 0, 30, ember' },
  { name: 'noise', group: 'math', arity: [1, 3], usage: 'noise(x, y, z)', summary: 'Smooth randomness between -1 and 1 that drifts as x, y, z change.', example: 'every frame\n  repeat 80 as i\n    dot i * 6 - 237, noise(i / 12, t / 2) * 160, 4, sea' },
  { name: 'rand', group: 'math', arity: [0, 2], usage: 'rand, rand(n), rand(a, b)', summary: 'A seeded random number: from 0 to 1, from 0 to n, or from a to b.', example: 'repeat 120\n  dot rand(-240, 240), rand(-240, 240), rand(2, 9), pick([ember, sea, ochre])' },
  { name: 'hue', group: 'color', arity: [1, 3], usage: 'hue(h [, s, l])', summary: 'A color from a hue angle in degrees (0 red, 120 green, 240 blue). s and l go from 0 to 1.', example: 'repeat 36 as i\n  dot cos(i / 36 * turn) * 170, sin(i / 36 * turn) * 170, 16, hue(i * 10)' },
  { name: 'mix', group: 'color', arity: [3, 3], usage: 'mix(a, b, k)', summary: 'Blends two colors, k of the way from a to b.', example: 'repeat 12 as i\n  box i * 36 - 198, 0, 36, 300, mix(night, ember, i / 11)' },
  { name: 'fade', group: 'color', arity: [2, 2], usage: 'fade(c, k)', summary: 'The same color made see-through: k = 1 is solid, 0 is invisible.', example: 'repeat 6 as i\n  dot i * 50 - 125, 0, 90, fade(sea, 0.25)' },
  { name: 'rgb', group: 'color', arity: [3, 4], usage: 'rgb(r, g, b [, a])', summary: 'A color from red, green and blue between 0 and 255 (a from 0 to 1).', example: 'box 0, 0, 300, 300, rgb(40, 90, 160)' },
  { name: 'polar', group: 'points', arity: [2, 2], usage: 'polar(r, a)', summary: 'The point at distance r from the center, at angle a.', example: 'repeat 24 as i\n  dot polar(180, i / 24 * turn), 10, ember' },
  { name: 'dist', group: 'points', arity: [2, 2], usage: 'dist(p, q)', summary: 'The distance between two points.', example: 'repeat 15 as i\n  repeat 15 as j\n    p = (i * 30 - 210, j * 30 - 210)\n    dot p, dist(p, (0, 0)) / 30, ink' },
  { name: 'len', group: 'lists', arity: [1, 1], usage: 'len(list)', summary: 'How many items a list (or text) has.', example: 'cs = [ember, ochre, moss, sea, plum]\nrepeat len(cs) as i\n  dot i * 80 - 160, 0, 30, cs[i]' },
  { name: 'range', group: 'lists', arity: [1, 1], usage: 'range(n)', summary: 'The list [0, 1, … n - 1].', example: 'for k in range(8)\n  ring 0, 0, k * 26 + 10' },
  { name: 'pick', group: 'lists', arity: [1, 1], usage: 'pick(list)', summary: 'A seeded random item from a list.', example: 'repeat 60\n  box rand(-220, 220), rand(-220, 220), 20, 20, pick([ink, ember, bone])' },
];

export interface ConstSpec extends Entry {}

export const CONSTANTS: ConstSpec[] = [
  { name: 't', group: 'values', usage: 't', summary: 'Seconds since the piece started. 0 outside every frame.', example: 'every frame\n  dot 0, 0, 40 + sin(t * 3) * 30, ember' },
  { name: 'turn', group: 'values', usage: 'turn', summary: 'A full turn in radians (about 6.283). Half a turn is turn / 2.', example: 'repeat 8 as i\n  dot polar(150, i * turn / 8), 20, ink' },
  { name: 'pi', group: 'values', usage: 'pi', summary: 'Half a turn, about 3.1416.', example: 'width 6\npath [polar(150, 0), polar(150, pi / 2), polar(150, pi)], sea' },
  { name: 'mouse', group: 'values', usage: 'mouse', summary: 'Where the pointer is, as a point (0, 0 until it moves over the canvas).', example: 'every frame\n  line 0, 0, mouse.x, mouse.y, ember\n  dot mouse, 12' },
];

/** The named palette. Hex values are the source of truth for every renderer. */
export const PALETTE: Record<string, string> = {
  ink: '#15130f',
  paper: '#f3eee4',
  bone: '#e6dcc8',
  chalk: '#fbf9f4',
  coal: '#2b2824',
  ash: '#8a8478',
  ember: '#e4572e',
  rust: '#a8432a',
  clay: '#c97b5a',
  ochre: '#e0a43a',
  sand: '#d8c39a',
  moss: '#6f8a4c',
  leaf: '#9cbf5c',
  sea: '#2f6f73',
  sky: '#86b3d1',
  night: '#1d2433',
  plum: '#6e4a6b',
  rose: '#e7a3a0',
  lilac: '#b7a6d6',
};

export const PALETTE_NOTES: Record<string, string> = {
  ink: 'deep printing ink',
  paper: 'the sheet itself',
  bone: 'warm, darker paper',
  chalk: 'nearly white',
  coal: 'soft black',
  ash: 'pencil gray',
  ember: 'the Squiggle orange',
  rust: 'burnt red',
  clay: 'terracotta',
  ochre: 'yellow earth',
  sand: 'pale tan',
  moss: 'deep green',
  leaf: 'spring green',
  sea: 'deep teal',
  sky: 'pale blue',
  night: 'midnight blue',
  plum: 'dusky purple',
  rose: 'soft pink',
  lilac: 'pale violet',
};

export const COMMAND_NAMES = new Set(COMMANDS.map((c) => c.name));
export const FUNCTION_NAMES = new Set(FUNCTIONS.map((f) => f.name));
export const CONSTANT_NAMES = new Set(CONSTANTS.map((c) => c.name));
export const KEYWORD_NAMES = new Set<string>(KEYWORDS);

/** Names a program can't assign to. */
export const RESERVED = new Set<string>([
  ...KEYWORD_NAMES, ...COMMAND_NAMES, ...FUNCTION_NAMES, ...CONSTANT_NAMES, ...Object.keys(PALETTE),
]);

/** Words people bring from other tools, mapped to what Squiggle calls them. */
export const SYNONYMS: Record<string, string> = {
  circle: 'dot (filled) or ring (outline)',
  ellipse: 'dot, after grow to stretch it',
  rect: 'box', rectangle: 'box', square: 'box',
  text: 'write', print: 'say', log: 'say', echo: 'say',
  background: 'paper', bg: 'paper', clear: 'paper',
  fill: 'color', stroke: 'color', strokeweight: 'width', thickness: 'width', weight: 'width',
  rotate: 'spin', turnby: 'spin', translate: 'move', scale: 'grow',
  push: 'keep', pop: 'keep', save: 'keep', restore: 'keep',
  loop: 'repeat', times: 'repeat', while: 'repeat',
  def: 'make', fn: 'make', func: 'make', function: 'make', to: 'make',
  polygon: 'shape', poly: 'shape', curve: 'path', polyline: 'path', point: 'dot', pixel: 'dot',
  random: 'rand', rnd: 'rand', perlin: 'noise', map: 'lerp', length: 'len',
  elif: 'else if', then: 'nothing (end the line and indent the next one)', end: 'nothing (blocks end when the indent ends)',
  draw: 'every frame', loopframe: 'every frame', animate: 'every frame', time: 't', tau: 'turn', twopi: 'turn',
};

export const KEY_NAMES = new Set([
  'space', 'enter', 'left', 'right', 'up', 'down', 'tab', 'backspace', 'escape',
  ...'abcdefghijklmnopqrstuvwxyz0123456789'.split(''),
]);

export const LIMITS = {
  /** evaluation steps per frame (and per handler run) */
  frameSteps: 250_000,
  /** evaluation steps for the lines outside every frame */
  setupSteps: 1_000_000,
  /** shapes per frame */
  maxOps: 20_000,
  /** items in one list */
  maxList: 10_000,
  /** characters in one piece of text */
  maxText: 2_000,
  /** how deep make can call itself */
  maxDepth: 64,
  /** points in one path or shape */
  maxPoints: 5_000,
};

export const SIZE = 512;
export const POST_LIMIT = 280;
