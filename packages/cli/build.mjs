import { build } from 'esbuild';
import { readFileSync, copyFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

await build({
  entryPoints: ['src/cli.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  outfile: 'dist/cli.js',
  external: ['@napi-rs/canvas', 'h264-mp4-encoder'],
  define: { __VERSION__: JSON.stringify(pkg.version) },
  legalComments: 'none',
  logLevel: 'warning',
});
copyFileSync('../../LICENSE', 'LICENSE');
console.log(`built squigglelang ${pkg.version}`);
