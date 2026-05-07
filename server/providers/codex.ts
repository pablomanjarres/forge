// OpenAI Codex CLI subprocess integration
// Uses `codex exec --json` for non-interactive tasks

import { spawn, type ChildProcess } from 'child_process'

export interface CodexTask {
  id: string
  prompt: string
  cwd?: string
  status: 'running' | 'done' | 'failed'
  pid?: number
}

const activeTasks = new Map<string, ChildProcess>()

export function launchCodexTask(
  id: string,
  prompt: string,
  cwd?: string,
  onOutput?: (data: string) => void,
  onComplete?: (exitCode: number | null) => void,
): ChildProcess {
  const codexBin = resolveCodexPath()
  const proc = spawn(codexBin, ['exec', '--json', prompt], {
    cwd: cwd || process.cwd(),
    env: {
      ...process.env,
      PATH: ['/opt/homebrew/bin', '/usr/local/bin', process.env.HOME + '/.local/bin', process.env.PATH].join(':'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  activeTasks.set(id, proc)

  proc.stdout?.on('data', (chunk: Buffer) => {
    onOutput?.(chunk.toString())
  })

  proc.stderr?.on('data', (chunk: Buffer) => {
    onOutput?.(chunk.toString())
  })

  proc.on('close', (code) => {
    activeTasks.delete(id)
    onComplete?.(code)
  })

  return proc
}

export function cancelTask(id: string): boolean {
  const proc = activeTasks.get(id)
  if (!proc) return false
  proc.kill('SIGTERM')
  activeTasks.delete(id)
  return true
}

function resolveCodexPath(): string {
  const { existsSync } = require('fs')
  const { join } = require('path')
  const candidates = [
    '/opt/homebrew/bin/codex',
    '/usr/local/bin/codex',
    join(process.env.HOME || '', '.local', 'bin', 'codex'),
  ]
  return candidates.find(p => existsSync(p)) || 'codex'
}

export async function checkHealth(): Promise<boolean> {
  const { existsSync } = await import('fs')
  const codexPath = resolveCodexPath()
  return existsSync(codexPath)
}
