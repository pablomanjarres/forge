import { build } from 'esbuild'
import { execSync } from 'child_process'
import { builtinModules } from 'module'

// 1. Build Vite frontend
console.log('Building frontend...')
execSync('npx vite build', { stdio: 'inherit' })

// 2. Compile Electron main + server
console.log('Compiling Electron + server...')

const nodeExternals = [
  ...builtinModules,
  ...builtinModules.map(m => `node:${m}`),
  'electron',
]

const banner = 'import { createRequire as _cr } from "module"; const require = _cr(import.meta.url);'

await build({
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  entryPoints: ['electron/main.ts'],
  outfile: 'dist-electron/main.mjs',
  external: nodeExternals,
  banner: { js: banner },
})

await build({
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  entryPoints: ['electron/preload.ts'],
  outfile: 'dist-electron/preload.js',
  external: nodeExternals,
})

await build({
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  entryPoints: ['server/index.ts'],
  outfile: 'dist-electron/server.mjs',
  external: nodeExternals,
  banner: { js: banner },
})

console.log('Build complete.')
