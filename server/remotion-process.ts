import { ChildProcess, spawn } from 'child_process'
import http from 'http'
import { augmentedEnv, resolveBin } from './bin-path.js'

const REMOTION_PORT = 3000
let remotionProcess: ChildProcess | null = null
let currentEntry: string | null = null

export function getRemotionStatus(): Promise<{ running: boolean; port: number }> {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${REMOTION_PORT}`, () => {
      resolve({ running: true, port: REMOTION_PORT })
      req.destroy()
    })
    req.on('error', () => {
      resolve({ running: false, port: REMOTION_PORT })
    })
    req.setTimeout(2000, () => {
      resolve({ running: false, port: REMOTION_PORT })
      req.destroy()
    })
  })
}

export function getCurrentEntry(): string | null {
  return currentEntry
}

export async function startRemotionStudio(
  projectDir: string,
  entry: string = 'src/index.ts',
): Promise<{ ok: boolean; pid?: number; error?: string; entry: string }> {
  const status = await getRemotionStatus()
  // If a studio is running but on a different entry, stop it so we can
  // relaunch scoped to the requested composition.
  if (status.running && currentEntry && currentEntry !== entry) {
    stopRemotionStudio()
    // Wait briefly for the port to free before respawning.
    await new Promise(r => setTimeout(r, 500))
  } else if (status.running) {
    return { ok: true, pid: remotionProcess?.pid, entry: currentEntry || entry }
  }

  return new Promise((resolve) => {
    try {
      currentEntry = entry
      // Bind to 0.0.0.0 so Tailscale and LAN devices can reach it
      remotionProcess = spawn(resolveBin('npx'), [
        'remotion', 'studio', entry,
        '--port', String(REMOTION_PORT),
        '--ip', '0.0.0.0',
      ], {
        cwd: projectDir,
        stdio: 'pipe',
        detached: false,
        env: augmentedEnv({ BROWSER: 'none' }),
      })

      remotionProcess.on('error', (err) => {
        remotionProcess = null
        currentEntry = null
        resolve({ ok: false, error: String(err), entry })
      })

      remotionProcess.on('exit', () => {
        remotionProcess = null
        currentEntry = null
      })

      // Poll until ready
      let attempts = 0
      const maxAttempts = 30
      const poll = setInterval(async () => {
        attempts++
        const s = await getRemotionStatus()
        if (s.running) {
          clearInterval(poll)
          resolve({ ok: true, pid: remotionProcess?.pid, entry })
        } else if (attempts >= maxAttempts) {
          clearInterval(poll)
          resolve({ ok: false, error: 'Timed out waiting for Remotion Studio to start', entry })
        }
      }, 1000)
    } catch (err) {
      resolve({ ok: false, error: String(err), entry })
    }
  })
}

export function stopRemotionStudio(): { ok: boolean } {
  if (remotionProcess) {
    remotionProcess.kill('SIGTERM')
    remotionProcess = null
    currentEntry = null
  }
  return { ok: true }
}

// Cleanup on process exit
process.on('exit', () => {
  if (remotionProcess) {
    remotionProcess.kill('SIGTERM')
  }
})
process.on('SIGINT', () => {
  stopRemotionStudio()
  process.exit()
})
process.on('SIGTERM', () => {
  stopRemotionStudio()
  process.exit()
})
