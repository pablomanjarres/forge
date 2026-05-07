import express from 'express'
import cors from 'cors'
import http from 'http'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { execSync, spawn } from 'child_process'
import { read, write, readObj, findById, upsert, remove, DATA_DIR } from './storage.js'
import { initWebSocket, broadcast } from './ws.js'
import { scanRemotionTemplates, getTemplateDefinition } from './remotion-templates.js'
import { getRemotionStatus, startRemotionStudio, stopRemotionStudio } from './remotion-process.js'
import { listDir as wsListDir, getWeeks, getProjects, createProject, moveFile, MEDIA_ROOT } from './media-workspace.js'
import { augmentedEnv, resolveBin } from './bin-path.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = parseInt(process.env.FORGE_PORT || '3400', 10)

// --- Secure key resolver ---
// In production, Electron main process injects a resolver that reads from macOS Keychain.
// Keys never touch disk in plaintext.
const KEY_NAMES: Record<string, string> = {
  gemini: 'gemini-api-key',
  runpod: 'runpod-api-key',
  elevenlabs: 'elevenlabs-api-key',
}

let _keyResolver: ((keyName: string) => string | null) | null = null

export function setKeyResolver(resolver: (keyName: string) => string | null) {
  _keyResolver = resolver
}

// Gemini supports multiple named keys routed per purpose (image, video, etc.).
// Config is stored in data/config.json under providers.gemini:
//   { keys: [{id,label}], routes: { image: id, ... }, defaultKey: id }
// Each key's secret lives in Keychain under service `gemini-key-<id>`.
export type GeminiPurpose = 'image' | 'video' | 'audio' | 'chat' | 'agentTasks'

function getGeminiConfig(): {
  keys: { id: string; label: string }[]
  routes: Record<string, string>
  models: Record<string, string>
  defaultKey?: string
  defaultModel?: string
} {
  const config = readObj<Record<string, any>>('config', { providers: {} })
  const g = config.providers?.gemini || {}
  return {
    keys: Array.isArray(g.keys) ? g.keys : [],
    routes: g.routes || {},
    models: g.models || {},
    defaultKey: g.defaultKey,
    defaultModel: g.defaultModel,
  }
}

export function getGeminiModel(purpose?: GeminiPurpose | string): string | undefined {
  const { models, defaultModel } = getGeminiConfig()
  if (purpose && models[purpose]) return models[purpose]
  return defaultModel
}

function readKeychain(keyName: string): string | null {
  if (_keyResolver) {
    const v = _keyResolver(keyName)
    if (v) return v
  }
  return null
}

export function getApiKey(provider: string, purpose?: GeminiPurpose | string): string | null {
  if (provider === 'gemini') {
    const { keys, routes, defaultKey } = getGeminiConfig()
    const routedId = (purpose && routes[purpose]) || defaultKey || keys[0]?.id
    if (routedId) {
      const fromKeychain = readKeychain(`gemini-key-${routedId}`)
      if (fromKeychain) return fromKeychain
      if (purpose) {
        const envScoped = process.env[`FORGE_GEMINI_${String(purpose).toUpperCase()}_API_KEY`]
        if (envScoped) return envScoped
      }
    }
    // Legacy single-key fallback
    const legacy = readKeychain('gemini-api-key')
    if (legacy) return legacy
    return process.env.FORGE_GEMINI_API_KEY || null
  }

  const keyName = KEY_NAMES[provider]
  if (!keyName) return null
  if (_keyResolver) return _keyResolver(keyName)
  return process.env[`FORGE_${provider.toUpperCase()}_API_KEY`] || null
}
const isDev = process.env.NODE_ENV !== 'production'

function findRemotionDir(): string | null {
  const mediaRemotionDir = path.join(MEDIA_ROOT, 'remotion-demos')
  const envDir = process.env.FORGE_REMOTION_DIR
  const candidates = [
    envDir,
    path.resolve(__dirname, '..', '..', 'remotion-demos'),
    path.join(process.env.HOME || '', 'Projects', 'remotion-demos'),
    path.join(process.env.HOME || '', 'Projects', 'skills', 'remotion-demos'),
    mediaRemotionDir,
    path.join(MEDIA_ROOT, 'videos', 'remotion-demos'),
  ].filter(Boolean) as string[]
  return candidates.find(d => fs.existsSync(path.join(d, 'src', 'Root.tsx'))) || null
}

const app = express()

// --- IP Whitelist (Tailscale + localhost) ---
function isTailscaleOrLocal(ip: string): boolean {
  const clean = ip.replace(/^::ffff:/, '')
  if (clean === '127.0.0.1' || clean === '::1') return true
  const parts = clean.split('.')
  if (parts.length !== 4) return false
  const first = parseInt(parts[0], 10)
  const second = parseInt(parts[1], 10)
  // Tailscale CGNAT range
  if (first === 100 && second >= 64 && second <= 127) return true
  // Private networks
  if (first === 192 && second === 168) return true
  if (first === 10) return true
  return false
}

function getAllowedOrigin(req: express.Request): string {
  const origin = req.headers.origin || ''
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin
  if (/^https?:\/\/(192\.168\.|10\.|100\.)/.test(origin)) return origin
  if (/^https?:\/\/[a-z0-9-]+\.ts\.net(:\d+)?$/i.test(origin)) return origin
  return ''
}

app.use((req, res, next) => {
  const ip = req.ip || req.socket.remoteAddress || ''
  if (!isTailscaleOrLocal(ip)) {
    res.status(403).json({ error: 'Forbidden' })
    return
  }
  next()
})

app.use((req, res, next) => {
  const origin = getAllowedOrigin(req)
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  }
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }
  next()
})

app.use(express.json({ limit: '50mb' }))

// --- Health ---
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', name: 'forge', port: PORT })
})

// --- Stats ---
app.get('/api/stats', (_req, res) => {
  const tasks = read<{ id: string; status: string }>('tasks')
  const media = read<{ id: string; type: string }>('media')
  const repos = read<{ id: string }>('repos')
  const storedTemplates = read<{ id: string }>('templates')
  const remotionDir = findRemotionDir()
  const scannedTemplates = remotionDir ? scanRemotionTemplates(remotionDir, DATA_DIR) : []
  const storedIds = new Set(storedTemplates.map(t => t.id))
  const allTemplates = [...storedTemplates, ...scannedTemplates.filter(c => !storedIds.has(c.id))]
  const activity = read<{ id: string }>('activity')

  res.json({
    tasks: { total: tasks.length, active: tasks.filter(t => t.status === 'running').length },
    media: { total: media.length, images: media.filter(m => m.type === 'image').length, videos: media.filter(m => m.type === 'video').length, audio: media.filter(m => m.type === 'audio').length },
    repos: repos.length,
    templates: allTemplates.length,
    recentActivity: activity.length,
  })
})

// --- Provider Config ---
app.get('/api/providers', (_req, res) => {
  const config = readObj('config', { providers: {} })
  res.json(config.providers || {})
})

app.post('/api/providers/:id', (req, res) => {
  const config = readObj<Record<string, unknown>>('config', { providers: {} })
  const providers = (config.providers || {}) as Record<string, unknown>
  // Strip API keys — those go through keychain only, never stored in config
  const { apiKey, ...safeSettings } = req.body
  providers[req.params.id] = safeSettings
  config.providers = providers
  write('config', config)
  res.json({ ok: true })
})

// --- Gemini multi-key config ---
// Keys metadata lives in data/config.json (providers.gemini.{keys,routes,defaultKey}).
// The secret for each key lives in Keychain under service `gemini-key-<id>`;
// the frontend writes secrets directly via the preload keychain bridge.
const GEMINI_PURPOSES = ['image', 'video', 'audio', 'chat', 'agentTasks'] as const

app.get('/api/providers/gemini/config', (_req, res) => {
  res.json(getGeminiConfig())
})

app.post('/api/providers/gemini/keys', (req, res) => {
  const { id, label } = req.body || {}
  if (!id || !/^[a-z0-9][a-z0-9-]*$/.test(id)) { res.status(400).json({ error: 'id must be kebab-case' }); return }
  if (!label) { res.status(400).json({ error: 'label required' }); return }
  const config = readObj<Record<string, any>>('config', { providers: {} })
  const gemini = config.providers?.gemini || { keys: [], routes: {} }
  const existing = (gemini.keys || []).find((k: any) => k.id === id)
  if (existing) { res.status(409).json({ error: 'key id already exists' }); return }
  gemini.keys = [...(gemini.keys || []), { id, label }]
  if (!gemini.defaultKey) gemini.defaultKey = id
  config.providers = { ...(config.providers || {}), gemini }
  write('config', config)
  res.status(201).json(getGeminiConfig())
})

app.delete('/api/providers/gemini/keys/:id', (req, res) => {
  const id = req.params.id
  const config = readObj<Record<string, any>>('config', { providers: {} })
  const gemini = config.providers?.gemini || { keys: [], routes: {} }
  gemini.keys = (gemini.keys || []).filter((k: any) => k.id !== id)
  // Unset any route that pointed to the deleted key
  gemini.routes = Object.fromEntries(Object.entries(gemini.routes || {}).filter(([, v]) => v !== id))
  if (gemini.defaultKey === id) gemini.defaultKey = gemini.keys[0]?.id
  config.providers = { ...(config.providers || {}), gemini }
  write('config', config)
  res.json(getGeminiConfig())
})

app.patch('/api/providers/gemini/routes', (req, res) => {
  const incomingRoutes: Record<string, string> = req.body?.routes || {}
  const incomingModels: Record<string, string> = req.body?.models || {}
  const defaultKey: string | undefined = req.body?.defaultKey
  const defaultModel: string | undefined = req.body?.defaultModel
  const config = readObj<Record<string, any>>('config', { providers: {} })
  const gemini = config.providers?.gemini || { keys: [], routes: {}, models: {} }
  const validIds = new Set((gemini.keys || []).map((k: any) => k.id))
  const routes: Record<string, string> = { ...gemini.routes }
  const models: Record<string, string> = { ...(gemini.models || {}) }
  for (const purpose of GEMINI_PURPOSES) {
    if (purpose in incomingRoutes) {
      const v = incomingRoutes[purpose]
      if (v === '' || v === null) delete routes[purpose]
      else if (v && validIds.has(v)) routes[purpose] = v
    }
    if (purpose in incomingModels) {
      const v = incomingModels[purpose]
      if (v === '' || v === null) delete models[purpose]
      else if (typeof v === 'string') models[purpose] = v.trim()
    }
  }
  gemini.routes = routes
  gemini.models = models
  if (defaultKey !== undefined) {
    gemini.defaultKey = defaultKey && validIds.has(defaultKey) ? defaultKey : undefined
  }
  if (defaultModel !== undefined) {
    gemini.defaultModel = typeof defaultModel === 'string' && defaultModel.trim() ? defaultModel.trim() : undefined
  }
  config.providers = { ...(config.providers || {}), gemini }
  write('config', config)
  res.json(getGeminiConfig())
})

// --- Provider Health Checks ---
app.get('/api/providers/:id/health', async (req, res) => {
  const { id } = req.params

  try {
    let healthy = false
    switch (id) {
      case 'gemini': {
        const { checkHealth } = await import('./providers/gemini.js')
        healthy = await checkHealth(getApiKey('gemini') || '')
        break
      }
      case 'codex': {
        const { checkHealth } = await import('./providers/codex.js')
        healthy = await checkHealth()
        break
      }
      case 'runpod': {
        const { checkHealth } = await import('./providers/runpod.js')
        healthy = await checkHealth(getApiKey('runpod') || '')
        break
      }
      case 'elevenlabs': {
        const { checkHealth } = await import('./providers/elevenlabs.js')
        healthy = await checkHealth(getApiKey('elevenlabs') || '')
        break
      }
      case 'claude': {
        try {
          // Electron's PATH is minimal — check common install locations
          const claudePaths = [
            path.join(process.env.HOME || '', '.local', 'bin', 'claude'),
            '/usr/local/bin/claude',
          ]
          healthy = claudePaths.some(p => fs.existsSync(p))
        } catch { healthy = false }
        break
      }
      default:
        res.status(404).json({ error: 'Unknown provider' })
        return
    }
    res.json({ id, healthy, checkedAt: new Date().toISOString() })
  } catch (err) {
    res.json({ id, healthy: false, error: String(err), checkedAt: new Date().toISOString() })
  }
})

// --- Tasks ---
app.get('/api/tasks', (_req, res) => {
  res.json(read('tasks'))
})

app.get('/api/tasks/:id', (req, res) => {
  const task = findById('tasks', req.params.id)
  if (!task) { res.status(404).json({ error: 'Not found' }); return }
  res.json(task)
})

app.post('/api/tasks', (req, res) => {
  const task = { ...req.body, id: req.body.id || crypto.randomUUID(), createdAt: new Date().toISOString() }
  upsert('tasks', task)
  broadcast({ type: 'task_created', data: task })
  res.status(201).json(task)
})

app.patch('/api/tasks/:id', (req, res) => {
  const existing = findById<Record<string, unknown>>('tasks', req.params.id)
  if (!existing) { res.status(404).json({ error: 'Not found' }); return }
  const updated = { ...existing, ...req.body, id: req.params.id }
  upsert('tasks', updated as { id: string })
  broadcast({ type: 'task_updated', data: updated })
  res.json(updated)
})

app.delete('/api/tasks/:id', (req, res) => {
  remove('tasks', req.params.id)
  res.json({ ok: true })
})

// --- Agent Task Execution ---
app.post('/api/tasks/launch', async (req, res) => {
  const { prompt, provider, cwd, mode = 'fire-and-forget' } = req.body
  if (!prompt) { res.status(400).json({ error: 'prompt required' }); return }

  const taskId = crypto.randomUUID()
  const task = {
    id: taskId,
    provider,
    type: mode === 'interactive' ? 'chat' : 'agent',
    prompt,
    cwd: cwd || undefined,
    status: 'running',
    output: [],
    createdAt: new Date().toISOString(),
  }
  upsert('tasks', task)
  broadcast({ type: 'task_created', data: task })

  if (provider === 'codex') {
    const { launchCodexTask } = await import('./providers/codex.js')
    launchCodexTask(
      taskId,
      prompt,
      cwd,
      (data) => {
        const existing = findById<any>('tasks', taskId)
        if (existing) {
          existing.output.push({ role: 'assistant', content: data, timestamp: new Date().toISOString() })
          upsert('tasks', existing)
        }
        broadcast({ type: 'agent_output', taskId, data: { role: 'assistant', content: data, timestamp: new Date().toISOString() } })
      },
      (exitCode) => {
        const existing = findById<any>('tasks', taskId)
        if (existing) {
          existing.status = exitCode === 0 ? 'done' : 'failed'
          existing.completedAt = new Date().toISOString()
          upsert('tasks', existing)
        }
        broadcast({ type: 'agent_status', taskId, status: exitCode === 0 ? 'done' : 'failed' })
      }
    )
  } else if (provider === 'gemini') {
    // Gemini chat task
    try {
      const apiKey = getApiKey('gemini', 'agentTasks')
      if (!apiKey) { res.status(400).json({ error: 'Gemini API key not configured' }); return }

      const { chat } = await import('./providers/gemini.js')
      const response = await chat(apiKey, prompt)

      const existing = findById<any>('tasks', taskId)
      if (existing) {
        existing.output.push({ role: 'assistant', content: response, timestamp: new Date().toISOString() })
        existing.status = 'done'
        existing.completedAt = new Date().toISOString()
        upsert('tasks', existing)
      }
      broadcast({ type: 'agent_output', taskId, data: { role: 'assistant', content: response, timestamp: new Date().toISOString() } })
      broadcast({ type: 'agent_status', taskId, status: 'done' })
    } catch (err) {
      const existing = findById<any>('tasks', taskId)
      if (existing) {
        existing.status = 'failed'
        existing.output.push({ role: 'error', content: String(err), timestamp: new Date().toISOString() })
        existing.completedAt = new Date().toISOString()
        upsert('tasks', existing)
      }
      broadcast({ type: 'agent_status', taskId, status: 'failed' })
    }
  }

  res.status(201).json(task)
})

app.post('/api/tasks/:id/cancel', async (req, res) => {
  const task = findById<any>('tasks', req.params.id)
  if (!task) { res.status(404).json({ error: 'Not found' }); return }

  if (task.provider === 'codex') {
    const { cancelTask } = await import('./providers/codex.js')
    cancelTask(req.params.id)
  }

  task.status = 'failed'
  task.completedAt = new Date().toISOString()
  upsert('tasks', task)
  broadcast({ type: 'agent_status', taskId: req.params.id, status: 'failed' })
  res.json({ ok: true })
})

// --- Media ---
app.get('/api/media', (_req, res) => {
  res.json(read('media'))
})

app.get('/api/media/:id', (req, res) => {
  const item = findById('media', req.params.id)
  if (!item) { res.status(404).json({ error: 'Not found' }); return }
  res.json(item)
})

app.post('/api/media', (req, res) => {
  const item = { ...req.body, id: req.body.id || crypto.randomUUID(), createdAt: new Date().toISOString() }
  upsert('media', item)
  broadcast({ type: 'media_created', data: item })
  res.status(201).json(item)
})

app.delete('/api/media/:id', (req, res) => {
  remove('media', req.params.id)
  res.json({ ok: true })
})

// --- Repos (enhanced with git operations) ---
app.get('/api/repos', (_req, res) => {
  res.json(read('repos'))
})

app.post('/api/repos', async (req, res) => {
  const { url, name } = req.body
  if (!url) { res.status(400).json({ error: 'url required' }); return }

  const repoName = name || url.split('/').pop()?.replace('.git', '') || 'repo'
  const reposDir = path.join(DATA_DIR, 'repos')
  if (!fs.existsSync(reposDir)) fs.mkdirSync(reposDir, { recursive: true })
  const localPath = path.join(reposDir, repoName)

  try {
    if (fs.existsSync(localPath)) {
      res.status(409).json({ error: 'Repo already exists locally' })
      return
    }
    execSync(`git clone ${url} ${localPath}`, { stdio: 'pipe' })
    const branch = execSync('git branch --show-current', { cwd: localPath }).toString().trim() || 'main'

    const repo = {
      id: crypto.randomUUID(),
      name: repoName,
      url,
      localPath,
      branch,
      lastPull: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    }
    upsert('repos', repo)
    broadcast({ type: 'repo_created', data: repo })
    res.status(201).json(repo)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

app.post('/api/repos/:id/pull', (req, res) => {
  const repo = findById<any>('repos', req.params.id)
  if (!repo) { res.status(404).json({ error: 'Not found' }); return }

  try {
    const output = execSync('git pull', { cwd: repo.localPath }).toString()
    repo.lastPull = new Date().toISOString()
    upsert('repos', repo)
    res.json({ ok: true, output })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

app.get('/api/repos/:id/tree', (req, res) => {
  const repo = findById<any>('repos', req.params.id)
  if (!repo) { res.status(404).json({ error: 'Not found' }); return }

  const treePath = (req.query.path as string) || ''
  const fullPath = path.join(repo.localPath, treePath)

  if (!fs.existsSync(fullPath)) { res.status(404).json({ error: 'Path not found' }); return }

  const entries = fs.readdirSync(fullPath, { withFileTypes: true })
    .filter(e => !e.name.startsWith('.') && e.name !== 'node_modules')
    .map(e => ({
      name: e.name,
      type: e.isDirectory() ? 'directory' : 'file',
      path: path.join(treePath, e.name),
    }))
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
      return a.name.localeCompare(b.name)
    })

  res.json(entries)
})

app.get('/api/repos/:id/file', (req, res) => {
  const repo = findById<any>('repos', req.params.id)
  if (!repo) { res.status(404).json({ error: 'Not found' }); return }

  const filePath = req.query.path as string
  if (!filePath) { res.status(400).json({ error: 'path required' }); return }

  const fullPath = path.join(repo.localPath, filePath)
  if (!fs.existsSync(fullPath)) { res.status(404).json({ error: 'File not found' }); return }

  const content = fs.readFileSync(fullPath, 'utf-8')
  res.json({ path: filePath, content })
})

app.delete('/api/repos/:id', (req, res) => {
  const repo = findById<any>('repos', req.params.id)
  if (repo?.localPath && fs.existsSync(repo.localPath)) {
    fs.rmSync(repo.localPath, { recursive: true, force: true })
  }
  remove('repos', req.params.id)
  res.json({ ok: true })
})

// --- Templates ---
app.get('/api/templates', (_req, res) => {
  const stored = read<{ id: string }>('templates')
  const remotionDir = findRemotionDir()
  const scanned = remotionDir ? scanRemotionTemplates(remotionDir, DATA_DIR) : []
  const storedIds = new Set(stored.map((t: any) => t.id))
  const merged = [...stored, ...scanned.filter(c => !storedIds.has(c.id))]
  res.json(merged)
})

app.get('/api/templates/:id', (req, res) => {
  // Check stored first, then scanned
  let t = findById('templates', req.params.id)
  if (!t) {
    const remotionDir = findRemotionDir()
    const scanned = remotionDir ? scanRemotionTemplates(remotionDir, DATA_DIR) : []
    t = scanned.find(s => s.id === req.params.id) as any
  }
  if (!t) { res.status(404).json({ error: 'Not found' }); return }
  res.json(t)
})

app.get('/api/templates/:id/instances', (req, res) => {
  const def = getTemplateDefinition(req.params.id)
  if (!def) { res.status(404).json({ error: 'Not a remotion template' }); return }
  res.json({ templateId: def.id, instances: def.instances || [] })
})

app.post('/api/templates', (req, res) => {
  const t = { ...req.body, id: req.body.id || crypto.randomUUID(), createdAt: new Date().toISOString() }
  upsert('templates', t)
  broadcast({ type: 'template_created', data: t })
  res.status(201).json(t)
})

app.patch('/api/templates/:id', (req, res) => {
  const existing = findById<Record<string, unknown>>('templates', req.params.id)
  if (!existing) { res.status(404).json({ error: 'Not found' }); return }
  const updated = { ...existing, ...req.body, id: req.params.id }
  upsert('templates', updated as { id: string })
  broadcast({ type: 'template_updated', data: updated })
  res.json(updated)
})

app.delete('/api/templates/:id', (req, res) => {
  remove('templates', req.params.id)
  res.json({ ok: true })
})

// Runs a Gemini-driven compose+render pipeline as a task: Gemini writes a
// Remotion composition, we render it locally with `npx remotion render`, and
// broadcast progress via WS (taskId + templateId).
async function runGeminiComposeTask(opts: {
  templateId: string
  description: string
  params?: Record<string, unknown>
  skillNames?: string[]
}): Promise<{ ok: true; taskId: string } | { ok: false; error: string }> {
  const remotionDir = findRemotionDir()
  if (!remotionDir) return { ok: false, error: 'Remotion project not found at ~/Projects/remotion-demos' }

  const apiKey = getApiKey('gemini', 'chat')
  if (!apiKey) return { ok: false, error: 'Gemini API key not configured — add one in /providers' }

  const model = getGeminiModel('chat')
  const taskId = crypto.randomUUID()
  const task: any = {
    id: taskId,
    provider: 'gemini',
    type: 'agent',
    templateId: opts.templateId,
    prompt: opts.description,
    model,
    status: 'running',
    output: [],
    createdAt: new Date().toISOString(),
  }
  upsert('tasks', task)
  broadcast({ type: 'task_created', data: task })

  const emit = (line: string) => {
    const entry = { role: 'assistant', content: line, timestamp: new Date().toISOString() }
    const existing = findById<any>('tasks', taskId)
    if (existing) {
      existing.output.push(entry)
      upsert('tasks', existing)
    }
    broadcast({ type: 'agent_output', taskId, templateId: opts.templateId, data: entry })
  }

  const finalize = (status: 'done' | 'failed', extra?: Record<string, unknown>) => {
    const existing = findById<any>('tasks', taskId)
    if (existing) {
      existing.status = status
      existing.completedAt = new Date().toISOString()
      if (extra) Object.assign(existing, extra)
      upsert('tasks', existing)
    }
    broadcast({ type: 'agent_status', taskId, templateId: opts.templateId, status, ...(extra || {}) })
  }

  // Run async — return taskId immediately.
  ;(async () => {
    try {
      emit(`Asking Gemini (${model || 'gemini-2.5-pro'}) for composition...`)
      const { generateRemotionComposition, writeAndRender } = await import('./gemini-compose.js')
      const composition = await generateRemotionComposition(apiKey, {
        description: opts.description + (opts.params && Object.keys(opts.params).length ? `\n\nParameters: ${JSON.stringify(opts.params, null, 2)}` : ''),
        templateId: opts.templateId,
        model,
        remotionDir,
        skillNames: opts.skillNames || ['remotion'],
      })
      emit(`Gemini returned "${composition.componentName}" (${composition.durationInFrames} frames @ ${composition.fps}fps, ${composition.width}x${composition.height}).`)
      emit('Writing composition files and starting render...')

      const { outputPath, relativePath } = await writeAndRender({
        remotionDir,
        composition,
        onStdout: (chunk) => {
          const line = chunk.split('\n').filter(Boolean).pop()
          if (line) emit(line.trim())
        },
      })
      emit(`Render complete: ${outputPath}`)

      // Patch the stored template so the card shows the new render.
      const existing = findById<any>('templates', opts.templateId)
      if (existing) {
        const updated = {
          ...existing,
          compositionIds: [composition.compositionId],
          type: 'remotion',
          fps: composition.fps,
          width: composition.width,
          height: composition.height,
          durationInFrames: composition.durationInFrames,
          renderPath: relativePath,
        }
        upsert('templates', updated)
        broadcast({ type: 'template_updated', data: updated })
      }

      finalize('done', { outputPath, renderPath: relativePath })
    } catch (err) {
      emit(`Error: ${String(err)}`)
      finalize('failed')
    }
  })()

  return { ok: true, taskId }
}

// Execute a template — runs Gemini compose+render. Always goes through Gemini
// for non-repo templates so output is reproducible with the user's chosen key.
app.post('/api/templates/:id/run', async (req, res) => {
  let template: any = findById('templates', req.params.id)
  if (!template) {
    const remotionDir = findRemotionDir()
    if (remotionDir) {
      template = scanRemotionTemplates(remotionDir, DATA_DIR).find(s => s.id === req.params.id)
    }
  }
  if (!template) { res.status(404).json({ error: 'Template not found' }); return }

  const params = req.body?.params ?? template.params?.values ?? {}
  const description = [
    template.name ? `Title: ${template.name}` : '',
    template.description || '',
  ].filter(Boolean).join('\n')

  const result = await runGeminiComposeTask({
    templateId: template.id,
    description,
    params,
    skillNames: req.body?.skillNames,
  })
  if (!result.ok) { res.status(400).json({ error: result.error }); return }
  res.status(201).json({ ok: true, taskId: result.taskId })
})

// Create a template from a prompt + immediately generate video with Gemini.
app.post('/api/templates/ai-create', async (req, res) => {
  const { prompt: userPrompt, skillNames } = req.body || {}
  if (!userPrompt || typeof userPrompt !== 'string') {
    res.status(400).json({ error: 'prompt required' })
    return
  }

  const slug = userPrompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'ai-template'
  const templateId = `${slug}-${Date.now().toString(36)}`

  const template = {
    id: templateId,
    name: userPrompt.slice(0, 60),
    type: 'pipeline',
    description: userPrompt,
    source: 'ai-generated',
    params: { schema: {}, values: {} },
    createdBy: 'ai',
    createdAt: new Date().toISOString(),
  }
  upsert('templates', template)
  broadcast({ type: 'template_created', data: template })

  const result = await runGeminiComposeTask({
    templateId,
    description: userPrompt,
    skillNames,
  })
  if (!result.ok) { res.status(400).json({ error: result.error }); return }
  res.status(201).json({ ok: true, taskId: result.taskId, templateId })
})

// List available skills (SKILL.md scan of known roots).
app.get('/api/skills', async (_req, res) => {
  const { listSkills } = await import('./skills.js')
  res.json(listSkills())
})

// Open a specific AI-generated composition in Remotion Studio (scoped to its
// own entry file so only that one composition is loaded — fast hot-reload).
app.post('/api/templates/:id/open-in-studio', async (req, res) => {
  const template = findById<any>('templates', req.params.id)
  if (!template) { res.status(404).json({ error: 'Template not found' }); return }
  const compositionId = template.compositionIds?.[0]
  if (!compositionId) { res.status(400).json({ error: 'Template has not been rendered yet' }); return }

  const remotionDir = findRemotionDir()
  if (!remotionDir) { res.status(400).json({ error: 'Remotion project not found' }); return }

  const entryRel = path.join('src', 'ai-generated', compositionId, 'entry.tsx')
  const entryAbs = path.join(remotionDir, entryRel)
  if (!fs.existsSync(entryAbs)) {
    res.status(404).json({ error: `Composition entry missing at ${entryRel}` })
    return
  }

  const result = await startRemotionStudio(remotionDir, entryRel)
  if (result.ok) broadcast({ type: 'remotion_status', running: true, entry: entryRel })
  res.json({ ...result, url: `http://localhost:3000` })
})

// Re-render a template with no Gemini involvement — picks up whatever's in
// composition.tsx (user edits via Studio / external editor).
app.post('/api/templates/:id/rerender', async (req, res) => {
  const template = findById<any>('templates', req.params.id)
  if (!template) { res.status(404).json({ error: 'Template not found' }); return }
  const compositionId = template.compositionIds?.[0]
  if (!compositionId) { res.status(400).json({ error: 'Template has no composition to render' }); return }

  const remotionDir = findRemotionDir()
  if (!remotionDir) { res.status(400).json({ error: 'Remotion project not found' }); return }

  const taskId = crypto.randomUUID()
  const task: any = {
    id: taskId, provider: 'remotion', type: 'render', templateId: req.params.id,
    prompt: `Re-render ${compositionId}`,
    status: 'running', output: [], createdAt: new Date().toISOString(),
  }
  upsert('tasks', task)
  broadcast({ type: 'task_created', data: task })

  const emit = (line: string) => {
    broadcast({
      type: 'agent_output', taskId, templateId: req.params.id,
      data: { role: 'assistant', content: line, timestamp: new Date().toISOString() },
    })
  }

  ;(async () => {
    try {
      emit('Re-rendering from current composition.tsx...')
      const { renderExisting } = await import('./gemini-compose.js')
      const { relativePath } = await renderExisting({
        remotionDir, compositionId,
        onStdout: (chunk) => {
          const line = chunk.split('\n').filter(Boolean).pop()
          if (line) emit(line.trim())
        },
      })
      const patched = { ...template, renderPath: relativePath }
      upsert('templates', patched)
      broadcast({ type: 'template_updated', data: patched })
      emit(`Render complete: ${relativePath}`)
      broadcast({ type: 'agent_status', taskId, templateId: req.params.id, status: 'done' })
    } catch (err) {
      emit(`Error: ${String(err)}`)
      broadcast({ type: 'agent_status', taskId, templateId: req.params.id, status: 'failed' })
    }
  })()

  res.status(202).json({ ok: true, taskId })
})

// Serve the rendered video for a template directly from remotion-demos/out/.
app.get('/api/templates/:id/video', (req, res) => {
  const template = findById<any>('templates', req.params.id)
  if (!template) { res.status(404).json({ error: 'Template not found' }); return }
  const compositionId = template.compositionIds?.[0]
  if (!compositionId) { res.status(404).json({ error: 'Not rendered yet' }); return }
  const remotionDir = findRemotionDir()
  if (!remotionDir) { res.status(404).json({ error: 'Remotion project not found' }); return }
  const videoPath = path.join(remotionDir, 'out', 'ai-generated', `${compositionId}.mp4`)
  if (!fs.existsSync(videoPath)) { res.status(404).json({ error: 'Video file missing' }); return }
  res.setHeader('Content-Type', 'video/mp4')
  res.sendFile(videoPath)
})

// Read the current composition.tsx for a template (used by the detail panel).
app.get('/api/templates/:id/code', (req, res) => {
  const template = findById<any>('templates', req.params.id)
  if (!template) { res.status(404).json({ error: 'Template not found' }); return }
  const compositionId = template.compositionIds?.[0]
  if (!compositionId) { res.status(404).json({ error: 'Not rendered yet' }); return }
  const remotionDir = findRemotionDir()
  if (!remotionDir) { res.status(404).json({ error: 'Remotion project not found' }); return }
  const codePath = path.join(remotionDir, 'src', 'ai-generated', compositionId, 'composition.tsx')
  if (!fs.existsSync(codePath)) { res.status(404).json({ error: 'composition.tsx missing' }); return }
  res.type('text/plain').send(fs.readFileSync(codePath, 'utf-8'))
})

// Gemini chat history per template — plain array stored in tasks dir.
app.get('/api/templates/:id/chat', (req, res) => {
  const template = findById<any>('templates', req.params.id)
  if (!template) { res.status(404).json({ error: 'Template not found' }); return }
  const chats = read<{ id: string; templateId: string; role: string; content: string; createdAt: string }>('template_chats')
  res.json(chats.filter(c => c.templateId === req.params.id))
})

// Ask Gemini to modify the composition per a chat message, re-render, and
// stream progress via WS. Persists chat history.
app.post('/api/templates/:id/modify', async (req, res) => {
  const { message } = req.body || {}
  if (!message || typeof message !== 'string') {
    res.status(400).json({ error: 'message required' })
    return
  }

  const template = findById<any>('templates', req.params.id)
  if (!template) { res.status(404).json({ error: 'Template not found' }); return }
  const compositionId = template.compositionIds?.[0]
  if (!compositionId) { res.status(400).json({ error: 'Template has no rendered composition to modify' }); return }

  const remotionDir = findRemotionDir()
  if (!remotionDir) { res.status(400).json({ error: 'Remotion project not found' }); return }
  const codePath = path.join(remotionDir, 'src', 'ai-generated', compositionId, 'composition.tsx')
  if (!fs.existsSync(codePath)) { res.status(400).json({ error: 'composition.tsx missing' }); return }

  const apiKey = getApiKey('gemini', 'chat')
  if (!apiKey) { res.status(400).json({ error: 'Gemini API key not configured' }); return }
  const model = getGeminiModel('chat')

  // Persist the user's turn immediately so the UI can reflect it.
  const userTurn = { id: crypto.randomUUID(), templateId: req.params.id, role: 'user', content: message, createdAt: new Date().toISOString() }
  upsert('template_chats', userTurn)
  broadcast({ type: 'template_chat', templateId: req.params.id, data: userTurn })

  const taskId = crypto.randomUUID()
  const task: any = {
    id: taskId, provider: 'gemini', type: 'modify', templateId: req.params.id, prompt: message,
    status: 'running', output: [], createdAt: new Date().toISOString(),
  }
  upsert('tasks', task)
  broadcast({ type: 'task_created', data: task })

  const emit = (line: string) => {
    broadcast({
      type: 'agent_output', taskId, templateId: req.params.id,
      data: { role: 'assistant', content: line, timestamp: new Date().toISOString() },
    })
  }

  ;(async () => {
    try {
      emit(`Asking Gemini (${model || 'gemini-2.5-pro'}) to modify composition...`)
      const currentCode = fs.readFileSync(codePath, 'utf-8')
      const { modifyRemotionComposition, writeAndRender } = await import('./gemini-compose.js')
      const updated = await modifyRemotionComposition(apiKey, {
        compositionId, currentCode, modificationRequest: message, model,
        remotionDir, skillNames: req.body?.skillNames,
      })
      emit('Writing updated composition and re-rendering...')
      const { relativePath } = await writeAndRender({
        remotionDir, composition: updated,
        onStdout: (chunk) => {
          const line = chunk.split('\n').filter(Boolean).pop()
          if (line) emit(line.trim())
        },
      })

      const assistantTurn = {
        id: crypto.randomUUID(), templateId: req.params.id, role: 'assistant',
        content: `Updated composition. ${updated.description || 'Re-rendered.'}`,
        createdAt: new Date().toISOString(),
      }
      upsert('template_chats', assistantTurn)
      broadcast({ type: 'template_chat', templateId: req.params.id, data: assistantTurn })

      const patched = { ...template, renderPath: relativePath, durationInFrames: updated.durationInFrames, fps: updated.fps, width: updated.width, height: updated.height }
      upsert('templates', patched)
      broadcast({ type: 'template_updated', data: patched })

      emit('Done.')
      broadcast({ type: 'agent_status', taskId, templateId: req.params.id, status: 'done' })
    } catch (err) {
      const failed = {
        id: crypto.randomUUID(), templateId: req.params.id, role: 'assistant',
        content: `Error: ${String(err)}`, createdAt: new Date().toISOString(),
      }
      upsert('template_chats', failed)
      broadcast({ type: 'template_chat', templateId: req.params.id, data: failed })
      emit(`Error: ${String(err)}`)
      broadcast({ type: 'agent_status', taskId, templateId: req.params.id, status: 'failed' })
    }
  })()

  res.status(202).json({ ok: true, taskId })
})

// Fork a template — create a focused variation and kick off a Gemini compose.
app.post('/api/templates/:id/fork', async (req, res) => {
  const { focus } = req.body || {}
  if (!focus || typeof focus !== 'string') {
    res.status(400).json({ error: 'focus required' })
    return
  }
  const parent = findById<any>('templates', req.params.id)
  if (!parent) { res.status(404).json({ error: 'Template not found' }); return }

  const slug = focus.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'variation'
  const newId = `${slug}-${Date.now().toString(36)}`

  const child = {
    id: newId,
    name: focus.slice(0, 60),
    type: 'pipeline',
    source: 'ai-generated',
    description: `Variation focused on: ${focus}\n\nBased on: "${parent.name}"\n${parent.description || ''}`,
    forkedFrom: parent.id,
    params: { schema: {}, values: {} },
    createdBy: 'ai',
    createdAt: new Date().toISOString(),
  }
  upsert('templates', child)
  broadcast({ type: 'template_created', data: child })

  const result = await runGeminiComposeTask({
    templateId: newId,
    description: child.description,
    skillNames: req.body?.skillNames,
  })
  if (!result.ok) { res.status(400).json({ error: result.error }); return }
  res.status(201).json({ ok: true, taskId: result.taskId, templateId: newId })
})

// Open the composition source in the user's default editor (macOS `open -t`).
app.post('/api/templates/:id/open-code', async (req, res) => {
  const template = findById<any>('templates', req.params.id)
  if (!template) { res.status(404).json({ error: 'Template not found' }); return }
  const compositionId = template.compositionIds?.[0]
  if (!compositionId) { res.status(400).json({ error: 'Template has not been rendered yet' }); return }

  const remotionDir = findRemotionDir()
  if (!remotionDir) { res.status(400).json({ error: 'Remotion project not found' }); return }

  const compositionPath = path.join(remotionDir, 'src', 'ai-generated', compositionId, 'composition.tsx')
  if (!fs.existsSync(compositionPath)) {
    res.status(404).json({ error: 'composition.tsx not found' })
    return
  }

  try {
    const { spawn } = await import('child_process')
    // `open -t` uses the default text editor on macOS
    spawn('open', ['-t', compositionPath], { detached: true, stdio: 'ignore' }).unref()
    res.json({ ok: true, path: compositionPath })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// Render a repo-scanned Remotion template through Forge's task stream.
app.post('/api/templates/:id/render-repo', async (req, res) => {
  const remotionDir = findRemotionDir()
  if (!remotionDir) { res.status(400).json({ error: 'Remotion project not found' }); return }

  const def = getTemplateDefinition(req.params.id)
  if (!def) { res.status(404).json({ error: 'Unknown remotion template' }); return }

  const compositionId = req.body?.compositionId || def.defaultCompositionId
  if (!def.compositionIds.includes(compositionId)) {
    res.status(400).json({ error: `Composition ${compositionId} is not part of ${def.id}` })
    return
  }

  const instance = def.instances?.find((item) => item.compositionId === compositionId)
  const renderPath = instance?.renderPath || def.renderPath

  if (!renderPath) {
    res.status(400).json({ error: 'Template has no renderPath configured' })
    return
  }

  const taskId = crypto.randomUUID()
  const currentPath = path.join(MEDIA_ROOT, renderPath)
  const featureDir = path.dirname(currentPath)
  const versionsDir = path.join(featureDir, 'versions')
  fs.mkdirSync(versionsDir, { recursive: true })
  fs.mkdirSync(path.join(featureDir, 'exports'), { recursive: true })

  // Pick next version number
  let nextN = 1
  if (fs.existsSync(versionsDir)) {
    for (const f of fs.readdirSync(versionsDir)) {
      const m = f.match(/^v(\d+)-/)
      if (m) nextN = Math.max(nextN, parseInt(m[1], 10) + 1)
    }
  }
  const isoStamp = new Date().toISOString().replace(/[:.]/g, '-').replace(/T/, 'T').slice(0, 19)
  const versionFilename = `v${String(nextN).padStart(3, '0')}-${isoStamp}.mp4`
  const versionPath = path.join(versionsDir, versionFilename)
  // Render straight into the versioned file; copy to current.mp4 on success.
  const outputPath = versionPath

  const task: any = {
    id: taskId,
    provider: 'remotion',
    type: 'render',
    templateId: req.params.id,
    prompt: `Render repo template ${compositionId}`,
    status: 'running',
    output: [],
    createdAt: new Date().toISOString(),
  }
  upsert('tasks', task)
  broadcast({ type: 'task_created', data: task })

  const emit = (line: string) => {
    const entry = { role: 'assistant', content: line, timestamp: new Date().toISOString() }
    const existing = findById<any>('tasks', taskId)
    if (existing) {
      existing.output.push(entry)
      upsert('tasks', existing)
    }
    broadcast({ type: 'agent_output', taskId, templateId: req.params.id, data: entry })
  }

  const finalize = (status: 'done' | 'failed', extra?: Record<string, unknown>) => {
    const existing = findById<any>('tasks', taskId)
    if (existing) {
      existing.status = status
      existing.completedAt = new Date().toISOString()
      if (extra) Object.assign(existing, extra)
      upsert('tasks', existing)
    }
    broadcast({ type: 'agent_status', taskId, templateId: req.params.id, status, ...(extra || {}) })
  }

  ;(async () => {
    try {
      emit(`Rendering ${compositionId} to ${outputPath}`)
      await new Promise<void>((resolve, reject) => {
        const proc = spawn(resolveBin('npx'), [
          'remotion', 'render',
          'src/index.ts',
          compositionId,
          outputPath,
          '--codec', 'h264',
          '--video-bitrate', '15M',
          '--log=info',
        ], {
          cwd: remotionDir,
          stdio: 'pipe',
          env: augmentedEnv({ BROWSER: 'none' }),
        })

        proc.stdout?.on('data', (chunk: Buffer) => {
          const line = chunk.toString().split('\n').filter(Boolean).pop()
          if (line) emit(line.trim())
        })
        proc.stderr?.on('data', (chunk: Buffer) => {
          const line = chunk.toString().split('\n').filter(Boolean).pop()
          if (line) emit(line.trim())
        })
        proc.on('error', reject)
        proc.on('exit', (code) => {
          if (code === 0) resolve()
          else reject(new Error(`remotion render exited with code ${code}`))
        })
      })

      // Atomically promote the new version to current.mp4
      fs.copyFileSync(versionPath, currentPath)
      emit(`Render complete: ${versionFilename} → ${renderPath}`)
      broadcast({ type: 'template_updated', data: { id: req.params.id, renderPath, versionFilename } })
      finalize('done', { outputPath: currentPath, renderPath, versionFilename })
    } catch (err) {
      emit(`Error: ${String(err)}`)
      finalize('failed')
    }
  })()

  res.status(202).json({ ok: true, taskId, renderPath })
})

// Thumbnail generation via remotion still
app.post('/api/templates/:id/render-thumbnail', async (req, res) => {
  const remotionDir = findRemotionDir()
  if (!remotionDir) { res.status(400).json({ error: 'Remotion project not found' }); return }

  const def = getTemplateDefinition(req.params.id)
  if (!def) { res.status(404).json({ error: 'Unknown remotion template' }); return }

  const compositionId = req.body.compositionId || def.defaultCompositionId
  const frame = req.body.frame ?? def.defaultThumbnailFrame

  const generatedDir = path.join(DATA_DIR, 'generated')
  if (!fs.existsSync(generatedDir)) fs.mkdirSync(generatedDir, { recursive: true })
  const outputFile = path.join(generatedDir, `thumb-${req.params.id}.png`)

  try {
    const { exec } = await import('child_process')
    const { promisify } = await import('util')
    const execAsync = promisify(exec)
    await execAsync(
      `npx remotion still src/index.ts ${compositionId} ${outputFile} --frame ${frame}`,
      { cwd: remotionDir, timeout: 60000, env: augmentedEnv() }
    )
    const thumbnail = `thumb-${req.params.id}.png`
    broadcast({ type: 'template_updated', data: { id: req.params.id, thumbnail } })
    res.json({ ok: true, thumbnail })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// --- Remotion Studio ---
app.get('/api/remotion/status', async (_req, res) => {
  const status = await getRemotionStatus()
  res.json(status)
})

app.post('/api/remotion/start', async (_req, res) => {
  const remotionDir = findRemotionDir()
  if (!remotionDir) { res.status(400).json({ error: 'Remotion project not found' }); return }
  const result = await startRemotionStudio(remotionDir)
  if (result.ok) broadcast({ type: 'remotion_status', running: true })
  res.json(result)
})

app.post('/api/remotion/stop', (_req, res) => {
  const result = stopRemotionStudio()
  broadcast({ type: 'remotion_status', running: false })
  res.json(result)
})

// --- Media files (from ~/Projects/media/) ---
app.get('/api/media-files', (req, res) => {
  const filePath = req.query.path as string
  if (!filePath || filePath.includes('..')) { res.status(400).json({ error: 'Invalid path' }); return }
  const fullPath = path.join(MEDIA_ROOT, filePath)
  if (!fs.existsSync(fullPath)) { res.status(404).json({ error: 'Not found' }); return }
  res.sendFile(fullPath)
})

// --- Media Workspace ---
app.get('/api/workspace/tree', (req, res) => {
  const p = (req.query.path as string) || ''
  if (p.includes('..')) { res.status(400).json({ error: 'Invalid path' }); return }
  res.json(wsListDir(p))
})

app.get('/api/workspace/weeks', (_req, res) => {
  res.json(getWeeks())
})

app.get('/api/workspace/projects', (req, res) => {
  const week = req.query.week as string | undefined
  res.json(getProjects(week))
})

app.post('/api/workspace/projects', (req, res) => {
  const { week, slug, title, type } = req.body
  if (!slug || !title) { res.status(400).json({ error: 'slug and title required' }); return }
  try {
    const project = createProject({ week, slug, title, type })
    broadcast({ type: 'workspace_project_created', data: project })
    res.status(201).json(project)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

app.post('/api/workspace/move', (req, res) => {
  const { from, to } = req.body
  if (!from || !to) { res.status(400).json({ error: 'from and to required' }); return }
  if (from.includes('..') || to.includes('..')) { res.status(400).json({ error: 'Invalid path' }); return }
  const ok = moveFile(from, to)
  if (!ok) { res.status(404).json({ error: 'Source not found' }); return }
  res.json({ ok: true })
})

// --- Activity Log ---
app.get('/api/activity', (_req, res) => {
  res.json(read('activity'))
})

app.post('/api/activity', (req, res) => {
  const entry = { ...req.body, id: req.body.id || crypto.randomUUID(), timestamp: new Date().toISOString() }
  upsert('activity', entry)
  broadcast({ type: 'activity', data: entry })
  res.status(201).json(entry)
})

// --- Media Generation ---
app.post('/api/generate/image', async (req, res) => {
  try {
    const { prompt, provider = 'gemini', model, width, height } = req.body
    if (!prompt) { res.status(400).json({ error: 'prompt required' }); return }

    const apiKey = getApiKey('gemini', 'image')
    const resolvedModel = model || getGeminiModel('image')

    if (provider === 'gemini') {
      if (!apiKey) { res.status(400).json({ error: 'Gemini API key not configured' }); return }
      const { generateImage } = await import('./providers/gemini.js')
      const result = await generateImage(apiKey, prompt, { model: resolvedModel, width, height })

      const mediaItem = {
        id: crypto.randomUUID(),
        type: 'image',
        provider,
        model: resolvedModel || 'gemini-2.0-flash-exp',
        prompt,
        filePath: result.filePath,
        width: result.width,
        height: result.height,
        createdAt: new Date().toISOString(),
      }
      upsert('media', mediaItem)
      broadcast({ type: 'media_created', data: mediaItem })
      res.json(mediaItem)
    } else if (provider === 'runpod-qwen') {
      const runpodKey = getApiKey('runpod')
      const endpointId = config.providers?.runpod?.endpoints?.['qwen-edit']
      if (!runpodKey || !endpointId) { res.status(400).json({ error: 'RunPod Qwen-Edit not configured' }); return }
      // For RunPod image generation, we need a source image — this is more of an edit
      res.status(400).json({ error: 'RunPod Qwen-Edit requires a source image. Use /api/generate/image/edit instead.' })
    } else {
      res.status(400).json({ error: `Unknown image provider: ${provider}` })
    }
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// Image editing via RunPod Qwen-Edit
app.post('/api/generate/image/edit', async (req, res) => {
  try {
    const { imagePath, prompt } = req.body
    if (!imagePath || !prompt) { res.status(400).json({ error: 'imagePath and prompt required' }); return }

    const config = readObj<Record<string, any>>('config', { providers: {} })
    const apiKey = getApiKey('runpod')
    const endpointId = config.providers?.runpod?.endpoints?.['qwen-edit']
    if (!apiKey || !endpointId) { res.status(400).json({ error: 'RunPod Qwen-Edit not configured' }); return }

    const { editImage } = await import('./providers/runpod.js')
    const result = await editImage(apiKey, endpointId, imagePath, prompt)

    const mediaItem = {
      id: crypto.randomUUID(),
      type: 'image',
      provider: 'runpod-qwen',
      model: 'qwen-edit',
      prompt,
      filePath: result.filePath,
      createdAt: new Date().toISOString(),
    }
    upsert('media', mediaItem)
    broadcast({ type: 'media_created', data: mediaItem })
    res.json(mediaItem)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// Image upscaling via RunPod RealESRGAN
app.post('/api/generate/image/upscale', async (req, res) => {
  try {
    const { imagePath, scale = 4 } = req.body
    if (!imagePath) { res.status(400).json({ error: 'imagePath required' }); return }

    const config = readObj<Record<string, any>>('config', { providers: {} })
    const apiKey = getApiKey('runpod')
    const endpointId = config.providers?.runpod?.endpoints?.realesrgan
    if (!apiKey || !endpointId) { res.status(400).json({ error: 'RunPod RealESRGAN not configured' }); return }

    const { upscaleImage } = await import('./providers/runpod.js')
    const result = await upscaleImage(apiKey, endpointId, imagePath, scale)

    const mediaItem = {
      id: crypto.randomUUID(),
      type: 'image',
      provider: 'runpod-esrgan',
      model: 'realesrgan',
      prompt: `Upscale ${scale}x`,
      filePath: result.filePath,
      createdAt: new Date().toISOString(),
    }
    upsert('media', mediaItem)
    broadcast({ type: 'media_created', data: mediaItem })
    res.json(mediaItem)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

app.post('/api/generate/video', async (req, res) => {
  try {
    const { prompt, provider = 'gemini', model } = req.body
    if (!prompt) { res.status(400).json({ error: 'prompt required' }); return }

    const apiKey = getApiKey('gemini', 'video')
    const resolvedModel = model || getGeminiModel('video')

    if (provider === 'gemini') {
      if (!apiKey) { res.status(400).json({ error: 'Gemini API key not configured' }); return }
      const { generateVideo } = await import('./providers/gemini.js')
      const result = await generateVideo(apiKey, prompt, { model: resolvedModel })

      const mediaItem = {
        id: crypto.randomUUID(),
        type: 'video',
        provider,
        model: resolvedModel || 'veo-2.0-generate-001',
        prompt,
        filePath: result.filePath,
        duration: result.duration,
        createdAt: new Date().toISOString(),
      }
      upsert('media', mediaItem)
      broadcast({ type: 'media_created', data: mediaItem })
      res.json(mediaItem)
    } else {
      res.status(400).json({ error: `Unknown video provider: ${provider}` })
    }
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

app.post('/api/generate/audio', async (req, res) => {
  try {
    const { text, provider = 'gemini', model, voiceName } = req.body
    if (!text) { res.status(400).json({ error: 'text required' }); return }

    if (provider === 'gemini') {
      const apiKey = getApiKey('gemini', 'audio')
      const resolvedModel = model || getGeminiModel('audio')
      if (!apiKey) { res.status(400).json({ error: 'Gemini API key not configured' }); return }
      const { generateSpeech } = await import('./providers/gemini.js')
      const result = await generateSpeech(apiKey, text, { model: resolvedModel, voiceName })

      const mediaItem = {
        id: crypto.randomUUID(),
        type: 'audio',
        provider,
        model: resolvedModel || 'gemini-2.5-flash-preview-tts',
        prompt: text,
        filePath: result.filePath,
        duration: result.duration,
        createdAt: new Date().toISOString(),
      }
      upsert('media', mediaItem)
      broadcast({ type: 'media_created', data: mediaItem })
      res.json(mediaItem)
    } else if (provider === 'elevenlabs') {
      const apiKey = getApiKey('elevenlabs')
      if (!apiKey) { res.status(400).json({ error: 'ElevenLabs API key not configured' }); return }
      const { generateSpeech: elevenSpeech } = await import('./providers/elevenlabs.js')
      const result = await elevenSpeech(apiKey, text, voiceName)

      const mediaItem = {
        id: crypto.randomUUID(),
        type: 'audio',
        provider: 'elevenlabs',
        model: 'eleven_multilingual_v2',
        prompt: text,
        filePath: result.filePath,
        duration: result.duration,
        createdAt: new Date().toISOString(),
      }
      upsert('media', mediaItem)
      broadcast({ type: 'media_created', data: mediaItem })
      res.json(mediaItem)
    } else if (provider === 'runpod-tts') {
      const apiKey = getApiKey('runpod')
      const endpointId = config.providers?.runpod?.endpoints?.['qwen3-tts']
      if (!apiKey || !endpointId) { res.status(400).json({ error: 'RunPod Qwen3-TTS not configured' }); return }
      const { generateTTS } = await import('./providers/runpod.js')
      const result = await generateTTS(apiKey, endpointId, text, voiceName)

      const mediaItem = {
        id: crypto.randomUUID(),
        type: 'audio',
        provider: 'runpod-tts',
        model: 'qwen3-tts',
        prompt: text,
        filePath: result.filePath,
        duration: result.duration,
        createdAt: new Date().toISOString(),
      }
      upsert('media', mediaItem)
      broadcast({ type: 'media_created', data: mediaItem })
      res.json(mediaItem)
    } else {
      res.status(400).json({ error: `Unknown audio provider: ${provider}` })
    }
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

app.post('/api/generate/chat', async (req, res) => {
  try {
    const { prompt, model, systemInstruction } = req.body
    if (!prompt) { res.status(400).json({ error: 'prompt required' }); return }

    const apiKey = getApiKey('gemini', 'chat')
    if (!apiKey) { res.status(400).json({ error: 'Gemini API key not configured' }); return }

    const { chat } = await import('./providers/gemini.js')
    const response = await chat(apiKey, prompt, { model: model || getGeminiModel('chat'), systemInstruction })
    res.json({ response })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// Serve generated media files
app.get('/api/generated/:filename', (req, res) => {
  const filePath = path.join(DATA_DIR, 'generated', req.params.filename)
  if (!fs.existsSync(filePath)) { res.status(404).json({ error: 'Not found' }); return }
  res.sendFile(filePath)
})

// --- Static serving (production) ---
if (!isDev) {
  const distPath = path.join(__dirname, '..', 'dist')
  app.use(express.static(distPath))
  app.get('/{*splat}', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

// --- Start server ---
const server = http.createServer(app)
initWebSocket(server)

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Forge server running on http://localhost:${PORT}`)
  console.log(`Data directory: ${DATA_DIR}`)
})

export { app, server }
