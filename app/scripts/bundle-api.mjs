// Bundles the existing catch-all API handler into a single ESM file for the
// CloudBase cloud function. lib/server/* is reused verbatim.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '..');
const outfile = resolve(process.env.MOMENTS_FUNCTION_OUTDIR || resolve(appRoot, 'dist', 'serverless', 'functions', 'moments-v2'), 'bundle.mjs');

await build({
  entryPoints: [resolve(appRoot, 'serverless', 'entry.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  tsconfig: resolve(appRoot, 'tsconfig.json'),
  external: ['pg', '@cloudbase/node-sdk'],
  loader: { '.json': 'json' },
  logLevel: 'info',
});

console.log(`bundled api -> ${outfile}`);
