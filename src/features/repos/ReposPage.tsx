import { useState, useEffect } from 'react'
import { PageShell } from '@/components/shared/PageShell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { GitBranch, Plus, RefreshCw, Trash2, FolderOpen, FileText, ChevronRight, ArrowLeft, Loader2, Sparkles } from 'lucide-react'

interface Repo {
  id: string
  name: string
  url: string
  localPath: string
  branch: string
  lastPull?: string
}

interface TreeEntry {
  name: string
  type: 'file' | 'directory'
  path: string
}

interface Skill {
  name: string
  description: string
  path: string
  source: 'claude-user' | 'stitch' | 'projects'
  skillMdPath: string
}

const SKILL_SOURCE_LABEL: Record<Skill['source'], string> = {
  'claude-user': '~/.claude/skills',
  stitch: '~/Projects/stitch-skills',
  projects: '~/Projects/skills',
}

export function ReposPage() {
  const [repos, setRepos] = useState<Repo[]>([])
  const [cloneUrl, setCloneUrl] = useState('')
  const [cloning, setCloning] = useState(false)
  const [pulling, setPulling] = useState<Record<string, boolean>>({})
  const [browsing, setBrowsing] = useState<{ repoId: string; path: string } | null>(null)
  const [tree, setTree] = useState<TreeEntry[]>([])
  const [fileContent, setFileContent] = useState<{ path: string; content: string } | null>(null)
  const [skills, setSkills] = useState<Skill[]>([])
  const [skillFilter, setSkillFilter] = useState<Skill['source'] | 'all'>('all')

  useEffect(() => {
    fetch('/api/repos').then(r => r.json()).then(setRepos).catch(() => {})
    fetch('/api/skills').then(r => r.json()).then(setSkills).catch(() => {})
  }, [])

  const cloneRepo = async () => {
    if (!cloneUrl.trim()) return
    setCloning(true)
    try {
      const res = await fetch('/api/repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: cloneUrl }),
      })
      const repo = await res.json()
      if (res.ok) {
        setRepos(prev => [...prev, repo])
        setCloneUrl('')
      }
    } catch (err) {
      console.error(err)
    } finally {
      setCloning(false)
    }
  }

  const pullRepo = async (id: string) => {
    setPulling(p => ({ ...p, [id]: true }))
    try {
      await fetch(`/api/repos/${id}/pull`, { method: 'POST' })
      const updated = await fetch('/api/repos').then(r => r.json())
      setRepos(updated)
    } finally {
      setPulling(p => ({ ...p, [id]: false }))
    }
  }

  const deleteRepo = async (id: string) => {
    await fetch(`/api/repos/${id}`, { method: 'DELETE' })
    setRepos(prev => prev.filter(r => r.id !== id))
    if (browsing?.repoId === id) setBrowsing(null)
  }

  const browseRepo = async (repoId: string, treePath: string = '') => {
    setBrowsing({ repoId, path: treePath })
    setFileContent(null)
    const res = await fetch(`/api/repos/${repoId}/tree?path=${encodeURIComponent(treePath)}`)
    setTree(await res.json())
  }

  const viewFile = async (repoId: string, filePath: string) => {
    const res = await fetch(`/api/repos/${repoId}/file?path=${encodeURIComponent(filePath)}`)
    setFileContent(await res.json())
  }

  const navigateUp = () => {
    if (!browsing) return
    const parent = browsing.path.split('/').slice(0, -1).join('/')
    browseRepo(browsing.repoId, parent)
  }

  return (
    <PageShell>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Repos</h1>
        <p className="text-muted-foreground mt-1">Clone, pull, and browse GitHub repositories.</p>
      </div>

      {/* Clone Form */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="font-semibold mb-3">Clone Repository</h3>
        <div className="flex gap-2">
          <Input
            value={cloneUrl}
            onChange={(e) => setCloneUrl(e.target.value)}
            placeholder="https://github.com/user/repo.git"
            className="font-mono text-xs"
            onKeyDown={(e) => { if (e.key === 'Enter') cloneRepo() }}
          />
          <Button onClick={cloneRepo} disabled={cloning || !cloneUrl.trim()}>
            {cloning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Repo List */}
      <div className="grid gap-3">
        {repos.map(repo => (
          <div key={repo.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <GitBranch className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-semibold">{repo.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{repo.url}</p>
                  {repo.lastPull && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Last pull: {new Date(repo.lastPull).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => browseRepo(repo.id)}>
                  <FolderOpen className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => pullRepo(repo.id)} disabled={pulling[repo.id]}>
                  <RefreshCw className={`h-4 w-4 ${pulling[repo.id] ? 'animate-spin' : ''}`} />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => deleteRepo(repo.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          </div>
        ))}
        {repos.length === 0 && (
          <div className="rounded-xl border border-border bg-card p-6 text-center">
            <p className="text-muted-foreground text-sm">No repos cloned yet. Clone one above.</p>
          </div>
        )}
      </div>

      {/* Skills — scanned from ~/.claude/skills, ~/Projects/stitch-skills, ~/Projects/skills */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-forge" />Skills
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Available to Gemini when generating videos from templates.
            </p>
          </div>
          <div className="flex items-center gap-1">
            {(['all', 'stitch', 'projects', 'claude-user'] as const).map(s => (
              <button
                key={s}
                onClick={() => setSkillFilter(s)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                  skillFilter === s
                    ? 'bg-forge/10 text-forge ring-1 ring-forge/20'
                    : 'bg-muted/30 text-muted-foreground hover:text-foreground'
                }`}
              >
                {s === 'all' ? 'All' : s === 'claude-user' ? 'Claude' : s === 'stitch' ? 'Stitch' : 'Projects'}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {skills
            .filter(s => skillFilter === 'all' || s.source === skillFilter)
            .map(s => (
              <div key={s.skillMdPath} className="rounded-lg ring-1 ring-white/[0.04] bg-card px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5 text-forge shrink-0" />
                  <span className="text-sm font-medium truncate">{s.name}</span>
                  <span className="ml-auto text-[10px] font-mono text-muted-foreground shrink-0">
                    {SKILL_SOURCE_LABEL[s.source]}
                  </span>
                </div>
                {s.description && (
                  <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{s.description}</p>
                )}
              </div>
            ))}
          {skills.length === 0 && (
            <div className="col-span-full rounded-lg ring-1 ring-white/[0.04] bg-card p-5 text-center">
              <p className="text-xs text-muted-foreground">
                No skills found. Add SKILL.md files to ~/.claude/skills, ~/Projects/stitch-skills/skills, or ~/Projects/skills/skills.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* File Browser */}
      {browsing && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
            {browsing.path && (
              <Button variant="ghost" size="sm" onClick={navigateUp}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <p className="text-xs font-mono text-muted-foreground">
              {repos.find(r => r.id === browsing.repoId)?.name}/{browsing.path || ''}
            </p>
          </div>

          {fileContent ? (
            <div className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-mono text-muted-foreground">{fileContent.path}</p>
                <Button variant="ghost" size="sm" onClick={() => setFileContent(null)}>Back</Button>
              </div>
              <pre className="bg-secondary rounded-lg p-4 text-xs font-mono overflow-x-auto max-h-96 overflow-y-auto">
                {fileContent.content}
              </pre>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {tree.map(entry => (
                <button
                  key={entry.path}
                  onClick={() => {
                    if (entry.type === 'directory') browseRepo(browsing.repoId, entry.path)
                    else viewFile(browsing.repoId, entry.path)
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2 text-sm hover:bg-secondary/50 transition-colors"
                >
                  {entry.type === 'directory' ? (
                    <FolderOpen className="h-4 w-4 text-amber-500" />
                  ) : (
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span>{entry.name}</span>
                  {entry.type === 'directory' && <ChevronRight className="h-3 w-3 ml-auto text-muted-foreground" />}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </PageShell>
  )
}
