import { existsSync } from 'fs'
import { join } from 'path'

// When Forge launches as a packaged .app from Finder/Dock, it inherits the
// minimal GUI PATH (/usr/bin:/bin:/usr/sbin:/sbin) and can't find npx, codex,
// etc. These are the common macOS install locations we need to make visible.
const EXTRA_PATHS: string[] = [
  '/opt/homebrew/bin',
  '/usr/local/bin',
  join(process.env.HOME || '', '.local', 'bin'),
  join(process.env.HOME || '', '.volta', 'bin'),
].filter((p) => p && existsSync(p))

export function augmentedEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const pathParts = [...EXTRA_PATHS, process.env.PATH].filter(Boolean)
  return {
    ...process.env,
    ...extra,
    PATH: pathParts.join(':'),
  }
}

export function resolveBin(name: string): string {
  for (const dir of EXTRA_PATHS) {
    const p = join(dir, name)
    if (existsSync(p)) return p
  }
  return name
}
