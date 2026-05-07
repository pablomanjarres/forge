import { useState, useEffect } from 'react'
import { Bot, Sparkles, Image, Video, AudioLines, ChevronDown, ChevronUp, CheckCircle, XCircle, Loader2, Clock } from 'lucide-react'

interface ActivityEntry {
  id: string
  tool: string
  params: Record<string, unknown>
  status: 'pending' | 'running' | 'done' | 'failed'
  result?: unknown
  source: string
  timestamp: string
}

const TOOL_ICONS: Record<string, typeof Bot> = {
  forge_generate_image: Image,
  forge_generate_video: Video,
  forge_generate_audio: AudioLines,
  forge_list_media: Sparkles,
  forge_list_repos: Bot,
  forge_list_templates: Bot,
}

function toolLabel(tool: string): string {
  return tool.replace('forge_', '').replace(/_/g, ' ')
}

function previewParams(params: Record<string, unknown>): string {
  const value = params.prompt || params.text
  return typeof value === 'string' ? value : JSON.stringify(params).slice(0, 60)
}

export function ActivityFeed() {
  const [entries, setEntries] = useState<ActivityEntry[]>([])
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  useEffect(() => {
    fetch('/api/activity').then(r => r.json()).then(setEntries).catch(() => {})

    // WebSocket for real-time updates
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${location.host}/ws`)
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      if (msg.type === 'activity') {
        setEntries(prev => {
          const existing = prev.findIndex(e => e.id === msg.data.id)
          if (existing >= 0) {
            const updated = [...prev]
            updated[existing] = msg.data
            return updated
          }
          return [msg.data, ...prev]
        })
      }
    }
    return () => ws.close()
  }, [])

  const statusIcon = (status: string) => {
    switch (status) {
      case 'done': return <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
      case 'failed': return <XCircle className="h-3.5 w-3.5 text-red-500" />
      case 'running': return <Loader2 className="h-3.5 w-3.5 text-amber-500 animate-spin" />
      default: return <Clock className="h-3.5 w-3.5 text-muted-foreground" />
    }
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-center">
        <p className="text-muted-foreground text-sm">No activity yet. Activity from Claude Code MCP calls will appear here.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {entries.slice(0, 20).map(entry => {
        const Icon = TOOL_ICONS[entry.tool] || Bot
        const isExpanded = expanded[entry.id]

        return (
          <div key={entry.id} className="rounded-xl border border-border bg-card overflow-hidden">
            <button
              onClick={() => setExpanded(e => ({ ...e, [entry.id]: !e[entry.id] }))}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary/30 transition-colors"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary shrink-0">
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-medium capitalize">{toolLabel(entry.tool)}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {previewParams(entry.params)}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {statusIcon(entry.status)}
                <span className="text-xs text-muted-foreground">
                  {new Date(entry.timestamp).toLocaleTimeString()}
                </span>
                {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </div>
            </button>

            {isExpanded && (
              <div className="px-4 pb-3 border-t border-border">
                <div className="mt-3 space-y-2">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase">Parameters</p>
                    <pre className="mt-1 text-xs font-mono bg-secondary rounded-lg p-2 overflow-x-auto">
                      {JSON.stringify(entry.params, null, 2)}
                    </pre>
                  </div>
                  {entry.result !== undefined && entry.result !== null && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase">Result</p>
                      <pre className="mt-1 text-xs font-mono bg-secondary rounded-lg p-2 overflow-x-auto max-h-48 overflow-y-auto">
                        {typeof entry.result === 'string' ? entry.result : JSON.stringify(entry.result, null, 2) || ''}
                      </pre>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">Source: {entry.source}</p>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
