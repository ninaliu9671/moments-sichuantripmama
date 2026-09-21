// Build CloudBase static hosting and cloud function artifacts without moving
// tracked source files or overwriting the checked-in function bundle.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '..');
const workRoot = resolve(appRoot, '.next-serverless-work');
const deployRoot = resolve(appRoot, 'dist', 'serverless');
const staticRoot = resolve(deployRoot, 'static');
const functionRoot = resolve(deployRoot, 'functions', 'moments-v2');
const cloudbaseConfig = JSON.parse(readFileSync(resolve(appRoot, 'serverless', 'cloudbaserc.json'), 'utf8'));

function run(command, args, cwd, extraEnv = {}) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed (exit ${result.status})`);
}

if (Number(process.versions.node.split('.')[0]) < 22) {
  throw new Error('Next.js static export requires local Node.js 22 or newer.');
}

rmSync(workRoot, { recursive: true, force: true });
rmSync(deployRoot, { recursive: true, force: true });
mkdirSync(workRoot, { recursive: true });

// Only files needed by the browser build are copied. API routes and server
// modules are deliberately absent, so Next can use output: 'export'.
for (const entry of ['app', 'components', 'hooks', 'lib', 'public', 'vendor']) {
  const source = resolve(appRoot, entry);
  if (!existsSync(source)) continue;
  cpSync(source, resolve(workRoot, entry), {
    recursive: true,
    filter: (path) => {
      const rel = relative(appRoot, path).replaceAll('\\', '/');
      return rel !== 'app/api' && rel !== 'lib/server';
    },
  });
}
for (const entry of ['next.config.ts', 'postcss.config.mjs', 'tsconfig.json', 'package.json']) {
  cpSync(resolve(appRoot, entry), resolve(workRoot, entry));
}

try {
  console.log('Building static site from isolated source copy...');
  run(
    process.execPath,
    [resolve(appRoot, 'node_modules', 'next', 'dist', 'bin', 'next'), 'build', '--webpack'],
    workRoot,
    {
      MOMENTS_TARGET: 'serverless', MOMENTS_BUILD_DIR: '.next', NEXT_TELEMETRY_DISABLED: '1',
      NEXT_PUBLIC_CLOUDBASE_ENV_ID: cloudbaseConfig.envId,
      NEXT_PUBLIC_CLOUDBASE_REGION: 'ap-shanghai',
    },
  );
  const exported = resolve(workRoot, 'out');
  if (!existsSync(resolve(exported, 'index.html'))) {
    throw new Error('Static export did not generate out/index.html.');
  }
  cpSync(exported, staticRoot, { recursive: true });
} finally {
  rmSync(workRoot, { recursive: true, force: true });
}

mkdirSync(functionRoot, { recursive: true });
cpSync(resolve(appRoot, '..', 'functions', 'moments', 'index.js'), resolve(functionRoot, 'index.js'));
cpSync(resolve(appRoot, '..', 'functions', 'moments', 'package.json'), resolve(functionRoot, 'package.json'));
// CloudBase installs these two external packages remotely. Pin the versions
// resolved by the repository lockfile so a later deploy cannot drift.
const functionPackagePath = resolve(functionRoot, 'package.json');
const functionPackage = JSON.parse(readFileSync(functionPackagePath, 'utf8'));
for (const name of Object.keys(functionPackage.dependencies)) {
  const installed = JSON.parse(readFileSync(resolve(appRoot, 'node_modules', name, 'package.json'), 'utf8'));
  functionPackage.dependencies[name] = installed.version;
}
writeFileSync(functionPackagePath, `${JSON.stringify(functionPackage, null, 2)}\n`);
console.log('Bundling CloudBase function...');
run(process.execPath, [resolve(here, 'bundle-api.mjs')], appRoot, {
  MOMENTS_FUNCTION_OUTDIR: functionRoot,
});
cpSync(resolve(appRoot, 'serverless', 'cloudbaserc.json'), resolve(deployRoot, 'cloudbaserc.json'));
console.log(`CloudBase release ready: ${deployRoot}`);
