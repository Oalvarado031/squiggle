import { $, boot } from '../lib/ui.ts';
import { Stage } from '../lib/stage.ts';
import '../styles/reference.css';

boot();
new Stage($<HTMLCanvasElement>('#stage'), {
  code: 'paper bone\nevery frame\n  p = (noise(t / 3) * 180, noise(9, t / 3) * 180)\n  repeat 14\n    dot p * (1 - i / 14), 3 + i * .5, fade(ash, i / 20)\n  dot p, 14, ember\n  ring 0, 0, 230, ink',
});
