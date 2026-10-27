import { defineConfig, type Plugin } from 'vite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EXAMPLES } from '../packages/core/src/index.ts';

/** The studio's first-visit piece, also printed into the HTML so the code shows before the editor loads. */
export const FIRST_PIECE = 'orbit-garden';

// <!-- @header --> / <!-- @footer --> / <!-- @head --> pull in shared partials.
function partials(): Plugin {
  return {
    name: 'squiggle-partials',
    transformIndexHtml(html) {
      return html.replace(/<!-- @(\w+) -->/g, (_, name) => {
        if (name === 'firstcode') {
          const code = (EXAMPLES.find((e) => e.slug === FIRST_PIECE) ?? EXAMPLES[0]).code.trimEnd();
          // One plain text block (the largest paint on the page); the editor adds the colors.
          const text = code.replace(/&/g, '&amp;').replace(/</g, '&lt;');
          return `<pre class="editor-standin" aria-hidden="true">${text}</pre>`;
        }
        return readFileSync(resolve(__dirname, `src/partials/${name}.html`), 'utf8');
      });
    },
  };
}

// Inlines each page's CSS (about 15 KB) so nothing blocks the first paint.
function inlineCss(): Plugin {
  return {
    name: 'squiggle-inline-css',
    enforce: 'post',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!ctx.bundle) return html;
        return html.replace(/<link rel="stylesheet"(?: crossorigin)? href="\/(assets\/[^"]+\.css)">/g, (tag, file) => {
          const asset = ctx.bundle![file];
          return asset && asset.type === 'asset' ? `<style>${String(asset.source)}</style>` : tag;
        });
      },
    },
  };
}

const pages = ['index', 'studio', 'wall', 'piece', 'learn', 'reference', '404'];

export default defineConfig({
  root: __dirname,
  publicDir: 'public',
  plugins: [partials(), inlineCss()],
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: { input: Object.fromEntries(pages.map((p) => [p, resolve(__dirname, `${p}.html`)])) },
  },
  worker: { format: 'es' },
});
