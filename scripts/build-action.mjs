// Copies the CLI bundle and its font into the GitHub Action (actions run committed code).
import { copyFileSync, mkdirSync } from 'node:fs';
const root = new URL('..', import.meta.url);
const at = (p) => new URL(p, root);
mkdirSync(at('action/squiggle-render/dist'), { recursive: true });
mkdirSync(at('action/squiggle-render/fonts'), { recursive: true });
copyFileSync(at('packages/cli/dist/cli.js'), at('action/squiggle-render/dist/cli.js'));
copyFileSync(at('packages/cli/fonts/Fraunces_400Regular.ttf'), at('action/squiggle-render/fonts/Fraunces_400Regular.ttf'));
copyFileSync(at('packages/cli/fonts/OFL-Fraunces.txt'), at('action/squiggle-render/fonts/OFL-Fraunces.txt'));
console.log('action/squiggle-render updated');
