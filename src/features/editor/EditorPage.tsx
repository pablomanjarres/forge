import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageShell } from '@/components/shared/PageShell'
import { Button } from '@/components/ui/button'
import { MonitorPlay, Power, PowerOff, ExternalLink, Circle } from 'lucide-react'

type StudioState = 'checking' | 'stopped' | 'starting' | 'running'

export function EditorPage() {
  const [searchParams] = useSearchParams()
  const composition = searchParams.get('composition')
  const templateId = searchParams.get('template')
  const [state, setState] = useState<StudioState>('checking')
  const [error, setError] = useState<string | null>(null)
  const [scope, setScope] = useState<string | null>(null)

  const checkStatus = async () => {
    try {
      const res = await fetch('/api/remotion/status')
      const data = await res.json()
      setState(data.running ? 'running' : 'stopped')
    } catch {
      setState('stopped')
    }
  }

  useEffect(() => {
    checkStatus()
    const interval = setInterval(checkStatus, 5000)
    return () => clearInterval(interval)
  }, [])

  // Auto-start scoped to a template when ?template=<id> is present.
  useEffect(() => {
    if (!templateId || state === 'running' || state === 'starting') return
    if (state === 'stopped' || state === 'checking') {
      startForTemplate(templateId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, state])

  // Repo-scanned templates use the main Remotion entry and select the target
  // composition in Studio. Opening Editor should therefore start Studio too.
  useEffect(() => {
    if (!composition || templateId || state === 'running' || state === 'starting') return
    if (state === 'stopped' || state === 'checking') {
      start(composition)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composition, templateId, state])

  const startForTemplate = async (id: string) => {
    setState('starting')
    setError(null)
    setScope(id)
    try {
      const res = await fetch(`/api/templates/${id}/open-in-studio`, { method: 'POST' })
      const data = await res.json()
      if (data.ok) setState('running')
      else {
        setError(data.error || 'Failed to start')
        setState('stopped')
      }
    } catch (err) {
      setError(String(err))
      setState('stopped')
    }
  }

  const start = async (nextScope?: string) => {
    setState('starting')
    setError(null)
    setScope(nextScope || null)
    try {
      const res = await fetch('/api/remotion/start', { method: 'POST' })
      const data = await res.json()
      if (data.ok) {
        setState('running')
      } else {
        setError(data.error || 'Failed to start')
        setState('stopped')
      }
    } catch (err) {
      setError(String(err))
      setState('stopped')
    }
  }

  const stop = async () => {
    try {
      await fetch('/api/remotion/stop', { method: 'POST' })
      setState('stopped')
    } catch {
      // ignore
    }
  }

  // Use current hostname so it works over Tailscale / LAN, not just localhost
  const studioHost = `${location.hostname}:3000`
  const studioUrl = composition
    ? `http://${studioHost}/${encodeURIComponent(composition)}`
    : `http://${studioHost}`

  return (
    <PageShell>
      {/* Running state — toolbar + iframe */}
      {state === 'running' && (
        <>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-2.5 py-1 ring-1 ring-emerald-500/20">
                <Circle className="h-2 w-2 fill-emerald-400 text-emerald-400 animate-pulse" />
                <span className="text-xs font-medium text-emerald-400">Live</span>
              </div>
              <div className="h-4 w-px bg-border" />
              <span className="text-sm text-muted-foreground font-mono">
                {scope || composition || 'All compositions'}
              </span>
              <span className="text-xs text-muted-foreground/50 font-mono">
                :3000
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Button variant="ghost" size="sm" onClick={() => window.open(studioUrl, '_blank', 'noopener,noreferrer')}>
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />Browser
              </Button>
              <Button variant="ghost" size="sm" onClick={stop} className="text-muted-foreground hover:text-destructive">
                <PowerOff className="h-3.5 w-3.5 mr-1.5" />Stop
              </Button>
            </div>
          </div>
          <div
            className="rounded-xl overflow-hidden ring-1 ring-white/[0.06] shadow-[0_2px_8px_rgba(0,0,0,0.3),0_16px_48px_rgba(0,0,0,0.2)]"
            style={{ height: 'calc(100vh - 200px)' }}
          >
            <iframe
              src={studioUrl}
              className="w-full h-full border-0"
              title="Remotion Studio"
              allow="clipboard-read; clipboard-write"
            />
          </div>
        </>
      )}

      {/* Loading / Starting states */}
      {(state === 'checking' || state === 'starting') && (
        <div
          className="flex-1 flex items-center justify-center rounded-xl ring-1 ring-white/[0.04] bg-card"
          style={{ minHeight: 'calc(100vh - 200px)' }}
        >
          <div className="text-center">
            <div className="relative mx-auto mb-6 h-12 w-12">
              <div className="absolute inset-0 rounded-full border-2 border-forge/20" />
              <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-forge animate-spin" />
            </div>
            <p className="text-sm text-muted-foreground">
              {state === 'checking' ? 'Checking Remotion Studio...' : 'Starting Remotion Studio...'}
            </p>
            {state === 'starting' && (
              <p className="text-xs text-muted-foreground/50 mt-2">
                Bundling the project — this may take a few seconds.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Stopped state */}
      {state === 'stopped' && (
        <div
          className="relative flex-1 flex items-center justify-center rounded-xl ring-1 ring-white/[0.04] bg-card overflow-hidden"
          style={{ minHeight: 'calc(100vh - 200px)' }}
        >
          {/* Subtle radial gradient */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_40%,var(--color-forge)/0.03,transparent_70%)]" />

          <div className="relative text-center max-w-sm">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/50 ring-1 ring-white/[0.06]">
              <MonitorPlay className="h-6 w-6 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-semibold tracking-tight mb-1.5">Remotion Studio</h2>
            <p className="text-sm text-muted-foreground leading-relaxed mb-6">
              Launch the development server to preview compositions, scrub through frames, and inspect animations.
            </p>
            {error && (
              <p className="text-sm text-destructive mb-4 rounded-lg bg-destructive/5 px-3 py-2 ring-1 ring-destructive/10">{error}</p>
            )}
            <Button
              onClick={() => start()}
              size="lg"
              className="bg-forge text-forge-foreground hover:bg-forge/90 shadow-[0_1px_2px_rgba(0,0,0,0.3),0_0_16px_var(--color-forge)/0.1]"
            >
              <Power className="h-4 w-4 mr-2" />Start Studio
            </Button>
          </div>
        </div>
      )}
    </PageShell>
  )
}
