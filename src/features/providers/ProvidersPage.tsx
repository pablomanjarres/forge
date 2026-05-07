import { useState, useEffect, useCallback } from 'react'
import { PageShell } from '@/components/shared/PageShell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Cpu,
  Bot,
  Sparkles,
  Server,
  Mic,
  CheckCircle,
  XCircle,
  RefreshCw,
  Eye,
  EyeOff,
  Plus,
  Trash2,
} from 'lucide-react'

interface ProviderConfig {
  id: string
  name: string
  icon: typeof Cpu
  auth: 'cli' | 'apikey'
  keyName?: string
  description: string
}

const PROVIDERS: ProviderConfig[] = [
  { id: 'claude', name: 'Claude Code', icon: Bot, auth: 'cli', description: 'MCP server — Claude calls into Forge' },
  { id: 'codex', name: 'Codex', icon: Cpu, auth: 'cli', description: 'OpenAI Codex CLI for code tasks' },
  { id: 'gemini', name: 'Gemini', icon: Sparkles, auth: 'apikey', keyName: 'gemini-api-key', description: 'Google AI — images, video, TTS, chat' },
  { id: 'runpod', name: 'RunPod', icon: Server, auth: 'apikey', keyName: 'runpod-api-key', description: 'GPU endpoints — Qwen-Edit, RealESRGAN, TTS' },
  { id: 'elevenlabs', name: 'ElevenLabs', icon: Mic, auth: 'apikey', keyName: 'elevenlabs-api-key', description: 'Voice generation and TTS' },
]

type HealthStatus = 'unknown' | 'checking' | 'healthy' | 'unhealthy'

export function ProvidersPage() {
  const [health, setHealth] = useState<Record<string, HealthStatus>>({})
  const [keys, setKeys] = useState<Record<string, string>>({})
  const [showKey, setShowKey] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})

  const checkHealth = useCallback(async (id: string) => {
    setHealth(h => ({ ...h, [id]: 'checking' }))
    try {
      const res = await fetch(`/api/providers/${id}/health`)
      const data = await res.json()
      setHealth(h => ({ ...h, [id]: data.healthy ? 'healthy' : 'unhealthy' }))
    } catch {
      setHealth(h => ({ ...h, [id]: 'unhealthy' }))
    }
  }, [])

  useEffect(() => {
    PROVIDERS.forEach(p => checkHealth(p.id))
  }, [checkHealth])

  const saveApiKey = async (provider: ProviderConfig) => {
    const key = keys[provider.id]
    if (!key || !provider.keyName) return

    setSaving(s => ({ ...s, [provider.id]: true }))

    // Save to macOS Keychain only — keys never stored as plaintext on disk
    if (window.electronAPI?.keychain) {
      await window.electronAPI.keychain.save(provider.keyName, key)
    }

    // Save non-sensitive config (enabled flag)
    await fetch(`/api/providers/${provider.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    })

    setSaving(s => ({ ...s, [provider.id]: false }))
    setKeys(k => ({ ...k, [provider.id]: '' }))
    checkHealth(provider.id)
  }

  const statusIcon = (status: HealthStatus) => {
    switch (status) {
      case 'healthy': return <CheckCircle className="h-4 w-4 text-emerald-500" />
      case 'unhealthy': return <XCircle className="h-4 w-4 text-red-500" />
      case 'checking': return <RefreshCw className="h-4 w-4 text-muted-foreground animate-spin" />
      default: return <div className="h-4 w-4 rounded-full bg-muted" />
    }
  }

  return (
    <PageShell>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Providers</h1>
          <p className="text-muted-foreground mt-1">Configure and test AI provider connections.</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => PROVIDERS.forEach(p => checkHealth(p.id))}
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Check All
        </Button>
      </div>

      <div className="grid gap-4">
        <GeminiPanel
          statusIcon={statusIcon(health['gemini'] || 'unknown')}
          onRecheck={() => checkHealth('gemini')}
          checking={health['gemini'] === 'checking'}
        />
        {PROVIDERS.filter(p => p.id !== 'gemini').map((provider) => (
          <div key={provider.id} className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
                <provider.icon className="h-5 w-5 text-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">{provider.name}</h3>
                  {statusIcon(health[provider.id] || 'unknown')}
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">{provider.description}</p>

                {provider.auth === 'apikey' && (
                  <div className="mt-3 flex items-end gap-2">
                    <div className="flex-1 max-w-md">
                      <Label htmlFor={`key-${provider.id}`} className="text-xs text-muted-foreground">
                        API Key
                      </Label>
                      <div className="relative mt-1">
                        <Input
                          id={`key-${provider.id}`}
                          type={showKey[provider.id] ? 'text' : 'password'}
                          placeholder="Enter API key..."
                          value={keys[provider.id] || ''}
                          onChange={(e) => setKeys(k => ({ ...k, [provider.id]: e.target.value }))}
                          className="pr-10 font-mono text-xs"
                        />
                        <button
                          onClick={() => setShowKey(s => ({ ...s, [provider.id]: !s[provider.id] }))}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showKey[provider.id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => saveApiKey(provider)}
                      disabled={!keys[provider.id] || saving[provider.id]}
                    >
                      {saving[provider.id] ? 'Saving...' : 'Save'}
                    </Button>
                  </div>
                )}

                {provider.auth === 'cli' && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Uses existing CLI authentication — no API key needed.
                  </p>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => checkHealth(provider.id)}
                disabled={health[provider.id] === 'checking'}
              >
                <RefreshCw className={`h-4 w-4 ${health[provider.id] === 'checking' ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </PageShell>
  )
}

// ---------------------------------------------------------------------------
// Gemini multi-key panel
// ---------------------------------------------------------------------------

interface GeminiKey { id: string; label: string }
interface GeminiConfig {
  keys: GeminiKey[]
  routes: Record<string, string>
  models: Record<string, string>
  defaultKey?: string
  defaultModel?: string
}

const GEMINI_PURPOSES: { id: string; label: string; hint: string; placeholder: string }[] = [
  { id: 'image', label: 'Image generation', hint: 'Imagen / gemini image', placeholder: 'gemini-2.5-flash-image' },
  { id: 'video', label: 'Video generation', hint: 'Veo', placeholder: 'veo-2.0-generate-001' },
  { id: 'audio', label: 'Audio / TTS', hint: 'gemini-tts', placeholder: 'gemini-2.5-flash-preview-tts' },
  { id: 'chat', label: 'Chat / composition', hint: 'also drives Gemini video-template generator', placeholder: 'gemini-2.5-pro' },
  { id: 'agentTasks', label: 'Agent tasks', hint: 'launched from /agents', placeholder: 'gemini-2.5-pro' },
]

function GeminiPanel({ statusIcon, onRecheck, checking }: {
  statusIcon: React.ReactNode
  onRecheck: () => void
  checking: boolean
}) {
  const [cfg, setCfg] = useState<GeminiConfig>({ keys: [], routes: {}, models: {} })
  const [newLabel, setNewLabel] = useState('')
  const [newSecret, setNewSecret] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/providers/gemini/config')
      setCfg(await res.json())
    } catch (err) {
      setError(String(err))
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const addKey = async () => {
    if (!newLabel.trim() || !newSecret.trim()) return
    const id = newLabel.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    if (!id) { setError('Label must contain letters or digits'); return }
    setAdding(true)
    setError(null)
    try {
      // Secret goes into macOS Keychain only — never to disk plaintext.
      const ok = await window.electronAPI?.keychain.save(`gemini-key-${id}`, newSecret.trim())
      if (!ok) {
        setError('Could not save to Keychain — is Electron available?')
        setAdding(false)
        return
      }
      const res = await fetch('/api/providers/gemini/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, label: newLabel.trim() }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setError(err.error || `HTTP ${res.status}`)
        return
      }
      setCfg(await res.json())
      setNewLabel('')
      setNewSecret('')
      onRecheck()
    } catch (err) {
      setError(String(err))
    } finally {
      setAdding(false)
    }
  }

  const deleteKey = async (id: string) => {
    if (!confirm(`Delete Gemini key "${id}"? This also clears the Keychain entry.`)) return
    try {
      await window.electronAPI?.keychain.delete(`gemini-key-${id}`)
      const res = await fetch(`/api/providers/gemini/keys/${id}`, { method: 'DELETE' })
      setCfg(await res.json())
      onRecheck()
    } catch (err) {
      setError(String(err))
    }
  }

  const patchRoutes = async (body: Record<string, unknown>) => {
    try {
      const res = await fetch('/api/providers/gemini/routes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      setCfg(await res.json())
    } catch (err) {
      setError(String(err))
    }
  }

  const updateRoute = (purpose: string, keyId: string) => patchRoutes({ routes: { [purpose]: keyId } })
  const updateModel = (purpose: string, model: string) => patchRoutes({ models: { [purpose]: model } })
  const updateDefault = (keyId: string) => patchRoutes({ defaultKey: keyId })
  const updateDefaultModel = (model: string) => patchRoutes({ defaultModel: model })

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
          <Sparkles className="h-5 w-5 text-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">Gemini</h3>
            {statusIcon}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Google AI — images, video, TTS, chat. Add multiple keys and route per purpose.
          </p>

          {error && (
            <div className="mt-3 rounded-md bg-destructive/10 ring-1 ring-destructive/20 px-3 py-1.5 text-xs text-destructive">
              {error}
            </div>
          )}

          {/* Keys list */}
          <div className="mt-4">
            <div className="text-xs font-medium text-muted-foreground mb-2">Keys</div>
            {cfg.keys.length === 0 && (
              <p className="text-xs text-muted-foreground/70 italic mb-2">No keys yet — add one below.</p>
            )}
            <div className="space-y-1.5">
              {cfg.keys.map(k => (
                <div key={k.id} className="flex items-center gap-2 rounded-md bg-background/50 ring-1 ring-white/[0.04] px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{k.label}</div>
                    <div className="text-[10px] font-mono text-muted-foreground truncate">gemini-key-{k.id}</div>
                  </div>
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <input
                      type="radio"
                      name="gemini-default"
                      checked={cfg.defaultKey === k.id}
                      onChange={() => updateDefault(k.id)}
                    />
                    default
                  </label>
                  <Button variant="ghost" size="sm" onClick={() => deleteKey(k.id)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Add new key */}
          <div className="mt-3 flex items-end gap-2 max-w-xl">
            <div className="w-40">
              <Label className="text-xs text-muted-foreground">Label</Label>
              <Input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Work / Personal"
                className="mt-1 text-xs"
              />
            </div>
            <div className="flex-1">
              <Label className="text-xs text-muted-foreground">API key</Label>
              <div className="relative mt-1">
                <Input
                  type={showSecret ? 'text' : 'password'}
                  value={newSecret}
                  onChange={(e) => setNewSecret(e.target.value)}
                  placeholder="AIza..."
                  className="pr-9 font-mono text-xs"
                />
                <button
                  type="button"
                  onClick={() => setShowSecret(s => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button size="sm" onClick={addKey} disabled={adding || !newLabel.trim() || !newSecret.trim()}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              {adding ? 'Adding…' : 'Add key'}
            </Button>
          </div>

          {/* Routing table */}
          {cfg.keys.length > 0 && (
            <div className="mt-5">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-medium text-muted-foreground">Routing</div>
                <div className="flex items-center gap-2">
                  <Label className="text-[10px] text-muted-foreground">Default model</Label>
                  <Input
                    defaultValue={cfg.defaultModel || ''}
                    onBlur={(e) => e.target.value !== (cfg.defaultModel || '') && updateDefaultModel(e.target.value)}
                    placeholder="gemini-2.5-pro"
                    className="h-7 w-56 font-mono text-[11px]"
                  />
                </div>
              </div>
              <div className="rounded-lg ring-1 ring-white/[0.04] divide-y divide-white/[0.04] overflow-hidden">
                {GEMINI_PURPOSES.map(p => (
                  <div key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{p.label}</div>
                      <div className="text-[10px] text-muted-foreground">{p.hint}</div>
                    </div>
                    <select
                      value={cfg.routes[p.id] || ''}
                      onChange={(e) => updateRoute(p.id, e.target.value)}
                      className="rounded-md bg-background ring-1 ring-white/[0.06] px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-forge/30"
                    >
                      <option value="">Use default{cfg.defaultKey ? ` (${cfg.keys.find(k => k.id === cfg.defaultKey)?.label || cfg.defaultKey})` : ''}</option>
                      {cfg.keys.map(k => (
                        <option key={k.id} value={k.id}>{k.label}</option>
                      ))}
                    </select>
                    <Input
                      defaultValue={cfg.models[p.id] || ''}
                      onBlur={(e) => e.target.value !== (cfg.models[p.id] || '') && updateModel(p.id, e.target.value)}
                      placeholder={p.placeholder}
                      className="h-7 w-56 font-mono text-[11px]"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={onRecheck} disabled={checking}>
          <RefreshCw className={`h-4 w-4 ${checking ? 'animate-spin' : ''}`} />
        </Button>
      </div>
    </div>
  )
}
