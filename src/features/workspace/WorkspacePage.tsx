import { useState, useEffect } from 'react'
import { PageShell } from '@/components/shared/PageShell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  FolderOpen, FileText, ChevronRight, ArrowLeft, Plus,
  Video, Image as ImageIcon, AudioLines, File, Clapperboard,
  ExternalLink, Loader2, X,
} from 'lucide-react'

interface DirEntry {
  name: string
  type: 'directory' | 'file'
  path: string
  size?: number
  mtime?: string
  mediaType?: string
}

interface Project {
  slug: string
  weekKey: string
  path: string
  meta: { title?: string; type?: string; createdAt?: string }
  sourceCount: number
  exportCount: number
}

const MEDIA_ICONS: Record<string, typeof Video> = {
  video: Video,
  image: ImageIcon,
  audio: AudioLines,
  premiere: Clapperboard,
  text: FileText,
  data: FileText,
}

function formatSize(bytes?: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`
}

export function WorkspacePage() {
  const [currentPath, setCurrentPath] = useState('')
  const [entries, setEntries] = useState<DirEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [preview, setPreview] = useState<DirEntry | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [showNewProject, setShowNewProject] = useState(false)
  const [newSlug, setNewSlug] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [creating, setCreating] = useState(false)

  const loadDir = async (p: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/workspace/tree?path=${encodeURIComponent(p)}`)
      const data = await res.json()
      setEntries(data)
      setCurrentPath(p)
    } catch {} finally {
      setLoading(false)
    }
  }

  const loadProjects = async () => {
    try {
      const res = await fetch('/api/workspace/projects')
      setProjects(await res.json())
    } catch {}
  }

  useEffect(() => {
    loadDir('')
    loadProjects()
  }, [])

  const navigate = (entry: DirEntry) => {
    if (entry.type === 'directory') {
      loadDir(entry.path)
    } else {
      setPreview(entry)
    }
  }

  const goUp = () => {
    const parent = currentPath.split('/').slice(0, -1).join('/')
    loadDir(parent)
  }

  const breadcrumbs = currentPath ? currentPath.split('/') : []

  const createNewProject = async () => {
    if (!newSlug.trim() || !newTitle.trim()) return
    setCreating(true)
    try {
      await fetch('/api/workspace/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: newSlug, title: newTitle }),
      })
      setNewSlug('')
      setNewTitle('')
      setShowNewProject(false)
      loadProjects()
    } catch {} finally {
      setCreating(false)
    }
  }

  const mediaUrl = (entry: DirEntry) => `/api/media-files?path=${encodeURIComponent(entry.path)}`

  return (
    <PageShell>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Media Workspace</h1>
          <p className="text-muted-foreground mt-1">Browse and organize ~/Projects/media/</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowNewProject(!showNewProject)}>
            <Plus className="h-4 w-4 mr-1" />New Project
          </Button>
        </div>
      </div>

      {/* New Project Form */}
      {showNewProject && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="font-semibold mb-3">New Video Project</h3>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <Label>Title</Label>
              <Input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Project title" className="mt-1" />
            </div>
            <div className="w-48">
              <Label>Slug</Label>
              <Input value={newSlug} onChange={e => setNewSlug(e.target.value)} placeholder="my-project" className="mt-1" />
            </div>
            <Button onClick={createNewProject} disabled={creating || !newSlug.trim() || !newTitle.trim()}>
              {creating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
              Create
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">Creates videos/{'{current-week}'}/content/{newSlug || 'slug'}/ with project.json, script.md, sources/, exports/</p>
        </div>
      )}

      {/* Recent Projects */}
      {currentPath === '' && projects.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Recent Projects</h2>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {projects.slice(0, 6).map(p => (
              <button
                key={p.path}
                onClick={() => loadDir(p.path)}
                className="rounded-xl border border-border bg-card p-4 text-left hover:border-muted-foreground/30 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Clapperboard className="h-4 w-4 text-violet-400 shrink-0" />
                  <span className="font-semibold truncate">{p.meta.title || p.slug}</span>
                </div>
                <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                  <span>{p.weekKey}</span>
                  <span>{p.sourceCount} sources</span>
                  <span>{p.exportCount} exports</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Breadcrumb + Back */}
      <div className="flex items-center gap-2 text-sm">
        {currentPath && (
          <Button variant="ghost" size="sm" onClick={goUp} className="shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        <button onClick={() => loadDir('')} className="text-muted-foreground hover:text-foreground transition-colors">
          media
        </button>
        {breadcrumbs.map((seg, i) => (
          <span key={i} className="flex items-center gap-1">
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
            <button
              onClick={() => loadDir(breadcrumbs.slice(0, i + 1).join('/'))}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {seg}
            </button>
          </span>
        ))}
      </div>

      {/* File Browser */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (() => {
        const dirs = entries.filter(e => e.type === 'directory')
        const files = entries.filter(e => e.type === 'file')
        const hasMedia = files.some(e => e.mediaType === 'image' || e.mediaType === 'video')

        return (
          <div className="space-y-4">
            {/* Directories — always list */}
            {dirs.length > 0 && (
              <div className="grid gap-1">
                {dirs.map(entry => (
                  <button
                    key={entry.path}
                    onClick={() => navigate(entry)}
                    className="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-transparent hover:border-border hover:bg-card transition-colors text-left"
                  >
                    <FolderOpen className="h-4 w-4 shrink-0 text-amber-400" />
                    <span className="truncate font-medium text-sm">{entry.name}</span>
                    <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                  </button>
                ))}
              </div>
            )}

            {/* Files — grid with previews if media, list otherwise */}
            {hasMedia ? (
              <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {files.map(entry => (
                  <button
                    key={entry.path}
                    onClick={() => setPreview(entry)}
                    className="rounded-xl border border-border bg-card overflow-hidden hover:border-muted-foreground/30 transition-colors text-left group"
                  >
                    <div className="aspect-video bg-muted/30 flex items-center justify-center overflow-hidden relative">
                      {entry.mediaType === 'image' && (
                        <img src={mediaUrl(entry)} alt={entry.name} className="w-full h-full object-cover" loading="lazy" />
                      )}
                      {entry.mediaType === 'video' && (
                        <video
                          src={mediaUrl(entry)}
                          className="w-full h-full object-cover"
                          muted
                          playsInline
                          preload="metadata"
                          onMouseEnter={(e) => (e.target as HTMLVideoElement).play()}
                          onMouseLeave={(e) => { const v = e.target as HTMLVideoElement; v.pause(); v.currentTime = 0 }}
                        />
                      )}
                      {entry.mediaType === 'audio' && (
                        <AudioLines className="h-8 w-8 text-emerald-400 opacity-40" />
                      )}
                      {!['image', 'video', 'audio'].includes(entry.mediaType || '') && (
                        <File className="h-8 w-8 text-muted-foreground opacity-40" />
                      )}
                      <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-black/60 backdrop-blur-sm text-white">
                        {formatSize(entry.size)}
                      </div>
                    </div>
                    <div className="px-3 py-2">
                      <p className="text-xs font-medium truncate">{entry.name}</p>
                    </div>
                  </button>
                ))}
              </div>
            ) : files.length > 0 ? (
              <div className="grid gap-1">
                {files.map(entry => {
                  const Icon = (entry.mediaType && MEDIA_ICONS[entry.mediaType]) || File
                  const iconColor = entry.mediaType === 'video' ? 'text-violet-400'
                    : entry.mediaType === 'image' ? 'text-blue-400'
                    : entry.mediaType === 'audio' ? 'text-emerald-400'
                    : entry.mediaType === 'premiere' ? 'text-purple-400'
                    : 'text-muted-foreground'

                  return (
                    <div key={entry.path} className="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-transparent hover:border-border hover:bg-card transition-colors cursor-pointer group">
                      <button onClick={() => navigate(entry)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                        <Icon className={`h-4 w-4 shrink-0 ${iconColor}`} />
                        <span className="truncate font-medium text-sm">{entry.name}</span>
                      </button>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        {entry.size !== undefined && <span>{formatSize(entry.size)}</span>}
                        <a href={mediaUrl(entry)} target="_blank" rel="noopener noreferrer"
                          className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-foreground">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : null}

            {entries.length === 0 && (
              <div className="rounded-xl border border-border bg-card p-8 text-center">
                <FolderOpen className="h-8 w-8 mx-auto text-muted-foreground mb-2 opacity-40" />
                <p className="text-muted-foreground">Empty directory</p>
              </div>
            )}
          </div>
        )
      })()}

      {/* File Preview Modal */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setPreview(null)}>
          <div className="relative max-w-4xl w-full mx-4" onClick={e => e.stopPropagation()}>
            <Button variant="ghost" size="sm" className="absolute -top-10 right-0 text-white" onClick={() => setPreview(null)}>
              <X className="h-5 w-5" />
            </Button>
            <div className="rounded-xl bg-card border border-border overflow-hidden">
              {preview.mediaType === 'video' && (
                <video src={mediaUrl(preview)} controls autoPlay className="w-full max-h-[70vh]" />
              )}
              {preview.mediaType === 'image' && (
                <img src={mediaUrl(preview)} alt={preview.name} className="w-full max-h-[70vh] object-contain" />
              )}
              {preview.mediaType === 'audio' && (
                <div className="p-8">
                  <audio src={mediaUrl(preview)} controls autoPlay className="w-full" />
                </div>
              )}
              {!['video', 'image', 'audio'].includes(preview.mediaType || '') && (
                <div className="p-8 text-center">
                  <File className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                  <p className="font-medium">{preview.name}</p>
                  <p className="text-sm text-muted-foreground mt-1">{formatSize(preview.size)}</p>
                </div>
              )}
              <div className="px-4 py-3 border-t border-border flex items-center justify-between text-sm">
                <span className="text-muted-foreground truncate">{preview.path}</span>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">{formatSize(preview.size)}</span>
                  <a href={mediaUrl(preview)} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" size="sm">
                      <ExternalLink className="h-3 w-3 mr-1" />Open
                    </Button>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  )
}
