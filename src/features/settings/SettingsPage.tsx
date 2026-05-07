import { useState, useEffect } from 'react'
import { PageShell } from '@/components/shared/PageShell'
import { CheckCircle, FolderOpen, Server } from 'lucide-react'

export function SettingsPage() {
  const [health, setHealth] = useState<{ status: string; port: number } | null>(null)

  useEffect(() => {
    fetch('/api/health')
      .then(r => r.json())
      .then(setHealth)
      .catch(() => setHealth(null))
  }, [])

  return (
    <PageShell>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">App configuration and system status.</p>
      </div>

      <div className="grid gap-4">
        {/* Server Status */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Server className="h-5 w-5 text-muted-foreground" />
            <h3 className="font-semibold">Server Status</h3>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              {health ? (
                <CheckCircle className="h-4 w-4 text-emerald-500" />
              ) : (
                <div className="h-4 w-4 rounded-full bg-red-500" />
              )}
              <span>{health ? `Running on port ${health.port}` : 'Not connected'}</span>
            </div>
          </div>
        </div>

        {/* Storage */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <FolderOpen className="h-5 w-5 text-muted-foreground" />
            <h3 className="font-semibold">Storage</h3>
          </div>
          <div className="space-y-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Data Directory</p>
              <p className="font-mono text-xs mt-1 text-foreground">~/Library/Mobile Documents/com~apple~CloudDocs/Forge/</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Dev Data Directory</p>
              <p className="font-mono text-xs mt-1 text-foreground">./data/</p>
            </div>
          </div>
        </div>

        {/* MCP Server */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Server className="h-5 w-5 text-muted-foreground" />
            <h3 className="font-semibold">MCP Server</h3>
          </div>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>Register with Claude Code:</p>
            <code className="block bg-secondary rounded-lg px-3 py-2 text-xs font-mono text-foreground">
              claude mcp add forge -- node /Users/pablo/Projects/forge/dist/mcp-server.js
            </code>
          </div>
        </div>
      </div>
    </PageShell>
  )
}
