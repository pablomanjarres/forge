import { useState, useEffect } from 'react'
import { PageShell } from '@/components/shared/PageShell'
import { ActivityFeed } from '@/components/shared/ActivityFeed'
import { Bot, Cpu, Sparkles, Server, Mic, CheckCircle, XCircle, Image, Video, AudioLines, LayoutTemplate } from 'lucide-react'

interface Stats {
  tasks: { total: number; active: number }
  media: { total: number; images: number; videos: number; audio: number }
  repos: number
  templates: number
  recentActivity: number
}

const PROVIDER_ICONS: Record<string, typeof Cpu> = {
  claude: Bot,
  codex: Cpu,
  gemini: Sparkles,
  runpod: Server,
  elevenlabs: Mic,
}

export function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [providerHealth, setProviderHealth] = useState<Record<string, boolean>>({})

  useEffect(() => {
    fetch('/api/stats').then(r => r.json()).then(setStats).catch(() => {})

    const providers = ['claude', 'codex', 'gemini', 'runpod', 'elevenlabs']
    providers.forEach(async (id) => {
      try {
        const res = await fetch(`/api/providers/${id}/health`)
        const data = await res.json()
        setProviderHealth(h => ({ ...h, [id]: data.healthy }))
      } catch {
        setProviderHealth(h => ({ ...h, [id]: false }))
      }
    })
  }, [])

  return (
    <PageShell>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Mission control — provider status and activity feed.</p>
      </div>

      {/* Provider Status */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Providers</h2>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
          {Object.entries(PROVIDER_ICONS).map(([id, Icon]) => (
            <div key={id} className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary">
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium capitalize">{id}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  {providerHealth[id] === undefined ? (
                    <div className="h-2 w-2 rounded-full bg-muted animate-pulse" />
                  ) : providerHealth[id] ? (
                    <CheckCircle className="h-3 w-3 text-emerald-500" />
                  ) : (
                    <XCircle className="h-3 w-3 text-red-500" />
                  )}
                  <span className="text-xs text-muted-foreground">
                    {providerHealth[id] === undefined ? 'checking...' : providerHealth[id] ? 'connected' : 'offline'}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Overview</h2>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Image className="h-4 w-4" />
              <span className="text-sm">Images</span>
            </div>
            <p className="text-2xl font-semibold mt-1">{stats?.media.images ?? '--'}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Video className="h-4 w-4" />
              <span className="text-sm">Videos</span>
            </div>
            <p className="text-2xl font-semibold mt-1">{stats?.media.videos ?? '--'}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <AudioLines className="h-4 w-4" />
              <span className="text-sm">Audio</span>
            </div>
            <p className="text-2xl font-semibold mt-1">{stats?.media.audio ?? '--'}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <LayoutTemplate className="h-4 w-4" />
              <span className="text-sm">Templates</span>
            </div>
            <p className="text-2xl font-semibold mt-1">{stats?.templates ?? '--'}</p>
          </div>
        </div>
      </div>

      {/* Activity Feed */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Activity Feed</h2>
        <ActivityFeed />
      </div>
    </PageShell>
  )
}
