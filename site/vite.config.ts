import { defineConfig, type Plugin } from 'vite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// <!-- @header --> / <!-- @footer --> / <!-- @head --> pull in shared partials.
function partials(): Plugin {
  return {
    name: 'squiggle-partials',
    transformIndexHtml(html) {
      return html.replace(/<!-- @(\w+) -->/g, (_, name) => readFileSync(resolve(__dirname, `src/partials/${name}.html`), 'utf8'));
    },
  };
}

const pages = ['index', 'studio', 'wall', 'piece', 'learn', 'reference', '404'];

export default defineConfig({
  root: __dirname,
  publicDir: 'public',
  plugins: [partials()],
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: { input: Object.fromEntries(pages.map((p) => [p, resolve(__dirname, `${p}.html`)])) },
  },
  worker: { format: 'es' },
});
