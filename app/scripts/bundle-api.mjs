// Bundle the gateway adapter and API into one CommonJS function entry.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '..');
const outfile = resolve(process.env.MOMENTS_FUNCTION_OUTDIR || resolve(appRoot, 'dist', 'serverless', 'functions', 'moments-v2'), 'index.js');

await build({
  entryPoints: [resolve(appRoot, 'serverless', 'entry.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  tsconfig: resolve(appRoot, 'tsconfig.json'),
  external: [],
  loader: { '.json': 'json' },
  logLevel: 'info',
});

console.log(`bundled api -> ${outfile}`);
