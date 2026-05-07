import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageShell } from '@/components/shared/PageShell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  LayoutTemplate, Plus, Video, Image, GitBranch,
  Sparkles, Play, Loader2, Trash2, Wand2, ArrowRight,
  Layers, MonitorPlay, ExternalLink, Camera, Code2,
  X,
} from 'lucide-react'

type TemplateType = 'remotion' | 'demo-recording' | 'image-preset' | 'pipeline'

interface TemplateInstance {
  compositionId: string
  label: string
  params: Record<string, unknown>
  renderPath?: string
}

interface Template {
  id: string
  name: string
  type: TemplateType
  description: string
  source: 'built-in' | 'repo' | 'ai-generated'
  templateKind?: 'parameterized' | 'standalone'
  compositionIds?: string[]
  instances?: TemplateInstance[]
  thumbnail?: string | null
  renderPath?: string | null
  fps?: number
  width?: number
  height?: number
  durationInFrames?: number
  params: { schema: Record<string, unknown>; values: Record<string, unknown>; steps?: unknown[] }
  createdBy: string
  createdAt: string
}

const TYPE_ICONS: Record<TemplateType, typeof Video> = {
  remotion: Video,
  'demo-recording': Play,
  'image-preset': Image,
  pipeline: ArrowRight,
}

const TYPE_COLORS: Record<TemplateType, string> = {
  remotion: 'text-violet-400',
  'demo-recording': 'text-blue-400',
  'image-preset': 'text-amber-400',
  pipeline: 'text-emerald-400',
}

export function TemplatesPage() {
  const navigate = useNavigate()
  const [templates, setTemplates] = useState<Template[]>([])
  const [filter, setFilter] = useState<TemplateType | 'all'>('all')
  const [showCreator, setShowCreator] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const [creating, setCreating] = useState(false)
  const [generatingThumb, setGeneratingThumb] = useState<string | null>(null)
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null)
  const [runningTemplate, setRunningTemplate] = useState<string | null>(null)
  const [runError, setRunError] = useState<{ id: string; msg: string } | null>(null)
  const [selectedVideo, setSelectedVideo] = useState<{ title: string; src: string; path: string } | null>(null)
  // Active runs launched from this page: templateId -> { taskId, status, output tail }.
  const [runs, setRuns] = useState<Record<string, { taskId: string; status: string; tail: string }>>({})

  // Manual creation form
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<TemplateType>('image-preset')
  const [newDesc, setNewDesc] = useState('')
  const [showManual, setShowManual] = useState(false)

  useEffect(() => {
    fetch('/api/templates').then(r => r.json()).then(setTemplates).catch(() => {})

    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${location.host}/ws`)
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      if (msg.type === 'template_created') {
        setTemplates(prev => prev.some(t => t.id === msg.data.id) ? prev : [msg.data, ...prev])
      }
      if (msg.type === 'template_updated') {
        setTemplates(prev => prev.map(t => t.id === msg.data.id ? { ...t, ...msg.data } : t))
      }
      // Stream run progress per template (only for runs we kicked off from this page).
      if (msg.type === 'agent_output' && msg.templateId) {
        setRuns(prev => {
          const entry = prev[msg.templateId]
          if (!entry) return prev
          const line = String(msg.data?.content || '').split('\n').filter(Boolean).pop() || entry.tail
          return { ...prev, [msg.templateId]: { ...entry, tail: line } }
        })
      }
      if (msg.type === 'agent_status' && msg.templateId) {
        setRuns(prev => {
          const entry = prev[msg.templateId]
          if (!entry) return prev
          return { ...prev, [msg.templateId]: { ...entry, status: msg.status } }
        })
      }
    }
    return () => ws.close()
  }, [])

  const filtered = filter === 'all' ? templates : templates.filter(t => t.type === filter)

  const createManual = async () => {
    if (!newName.trim()) return
    try {
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName,
          type: newType,
          description: newDesc,
          source: 'built-in',
          params: { schema: {}, values: {} },
          createdBy: 'user',
        }),
      })
      const template = await res.json()
      setTemplates(prev => [template, ...prev])
      setNewName('')
      setNewDesc('')
      setShowManual(false)
    } catch (err) {
      console.error(err)
    }
  }

  const createWithAI = async () => {
    if (!aiPrompt.trim()) return
    setCreating(true)
    try {
      const res = await fetch('/api/templates/ai-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: aiPrompt }),
      })
      const data = await res.json()
      if (!res.ok) {
        setRunError({ id: '__ai__', msg: data.error || `HTTP ${res.status}` })
        return
      }
      // Track the in-flight AI generation the same way we track Run tasks —
      // the template row will appear via the template_created WS event.
      if (data.templateId && data.taskId) {
        setRuns(prev => ({
          ...prev,
          [data.templateId]: { taskId: data.taskId, status: 'running', tail: 'Asking Gemini...' },
        }))
      }
      setAiPrompt('')
      setShowCreator(false)
    } catch (err) {
      setRunError({ id: '__ai__', msg: String(err) })
    } finally {
      setCreating(false)
    }
  }

  const deleteTemplate = async (id: string) => {
    await fetch(`/api/templates/${id}`, { method: 'DELETE' })
    setTemplates(prev => prev.filter(t => t.id !== id))
  }

  const mediaUrl = (renderPath: string) => `/api/media-files?path=${encodeURIComponent(renderPath)}`

  const openVideo = (template: Template) => {
    if (!template.renderPath) return
    setSelectedVideo({
      title: template.name,
      path: template.renderPath,
      src: mediaUrl(template.renderPath),
    })
  }

  const openInStudio = (template: Template) => {
    const compositionId = template.compositionIds?.[0]
    if (template.source === 'repo' && compositionId) {
      navigate(`/editor?composition=${encodeURIComponent(compositionId)}`)
      return
    }
    navigate(`/editor?template=${template.id}`)
  }

  const openCode = async (template: Template) => {
    try {
      const res = await fetch(`/api/templates/${template.id}/open-code`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setRunError({ id: template.id, msg: data.error || `HTTP ${res.status}` })
      }
    } catch (err) {
      setRunError({ id: template.id, msg: String(err) })
    }
  }

  const runTemplate = async (template: Template) => {
    setRunningTemplate(template.id)
    setRunError(null)
    try {
      const res = await fetch(`/api/templates/${template.id}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ params: template.params?.values || {} }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setRunError({ id: template.id, msg: data.error || `HTTP ${res.status}` })
        return
      }
      if (data.taskId) {
        setRuns(prev => ({
          ...prev,
          [template.id]: { taskId: data.taskId, status: 'running', tail: 'Asking Gemini...' },
        }))
      }
    } catch (err) {
      setRunError({ id: template.id, msg: String(err) })
    } finally {
      setRunningTemplate(null)
    }
  }

  const renderRepoTemplate = async (template: Template) => {
    setRunningTemplate(template.id)
    setRunError(null)
    try {
      const res = await fetch(`/api/templates/${template.id}/render-repo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ compositionId: template.compositionIds?.[0] }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setRunError({ id: template.id, msg: data.error || `HTTP ${res.status}` })
        return
      }
      if (data.taskId) {
        setRuns(prev => ({
          ...prev,
          [template.id]: { taskId: data.taskId, status: 'running', tail: 'Rendering with Remotion...' },
        }))
      }
    } catch (err) {
      setRunError({ id: template.id, msg: String(err) })
    } finally {
      setRunningTemplate(null)
    }
  }

  const generateThumbnail = async (template: Template) => {
    setGeneratingThumb(template.id)
    try {
      const res = await fetch(`/api/templates/${template.id}/render-thumbnail`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (data.thumbnail) {
        setTemplates(prev => prev.map(t => t.id === template.id ? { ...t, thumbnail: data.thumbnail } : t))
      }
    } catch (err) {
      console.error(err)
    } finally {
      setGeneratingThumb(null)
    }
  }

  const durationLabel = (t: Template) => {
    if (!t.fps || !t.durationInFrames) return null
    return `${(t.durationInFrames / t.fps).toFixed(1)}s`
  }

  return (
    <PageShell>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Templates</h1>
          <p className="text-sm text-muted-foreground mt-1">Reusable recipes for videos, demos, images, and pipelines.</p>
          {runError?.id === '__ai__' && (
            <div className="mt-2 rounded-md bg-destructive/10 ring-1 ring-destructive/20 px-3 py-1.5 text-xs text-destructive">
              AI generation failed: {runError.msg}
            </div>
          )}
        </div>
        <div className="flex gap-1.5">
          <Button variant="outline" size="sm" onClick={() => setShowManual(!showManual)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />Create
          </Button>
          <Button size="sm" onClick={() => setShowCreator(!showCreator)} className="bg-forge text-forge-foreground hover:bg-forge/90">
            <Wand2 className="h-3.5 w-3.5 mr-1.5" />AI
          </Button>
        </div>
      </div>

      {/* AI Creator */}
      {showCreator && (
        <div className="rounded-xl ring-1 ring-white/[0.06] bg-card p-5 bg-gradient-to-b from-forge/[0.03] to-card">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-forge" />Create with AI
          </h3>
          <div className="space-y-3">
            <textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="Describe the template you want... e.g., 'A product demo video template with dark tech aesthetic, terminal recordings, and synthwave soundtrack'"
              rows={3}
              className="w-full rounded-lg bg-background/50 ring-1 ring-white/[0.06] px-3 py-2.5 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-forge/30 resize-none transition-shadow"
            />
            <Button onClick={createWithAI} disabled={creating || !aiPrompt.trim()} className="bg-forge text-forge-foreground hover:bg-forge/90">
              {creating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              Generate Template
            </Button>
          </div>
        </div>
      )}

      {/* Manual Creator */}
      {showManual && (
        <div className="rounded-xl ring-1 ring-white/[0.06] bg-card p-5">
          <h3 className="font-semibold mb-3">Create Template</h3>
          <div className="space-y-3">
            <div>
              <Label>Name</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Template name" className="mt-1" />
            </div>
            <div>
              <Label>Type</Label>
              <div className="flex gap-1.5 mt-1.5">
                {(['remotion', 'demo-recording', 'image-preset', 'pipeline'] as TemplateType[]).map(type => {
                  const Icon = TYPE_ICONS[type]
                  return (
                    <button
                      key={type}
                      onClick={() => setNewType(type)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        newType === type
                          ? 'bg-forge/10 text-forge ring-1 ring-forge/20'
                          : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80'
                      }`}
                    >
                      <Icon className="h-3 w-3" />{type}
                    </button>
                  )
                })}
              </div>
            </div>
            <div>
              <Label>Description</Label>
              <Input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="What does this template do?" className="mt-1" />
            </div>
            <Button onClick={createManual} disabled={!newName.trim()}>
              <Plus className="h-4 w-4 mr-2" />Create
            </Button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-1.5">
        {['all', 'remotion', 'demo-recording', 'image-preset', 'pipeline'].map(type => (
          <button
            key={type}
            onClick={() => setFilter(type as TemplateType | 'all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              filter === type
                ? 'bg-forge/10 text-forge ring-1 ring-forge/20'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            {type === 'all' ? 'All' : type}
          </button>
        ))}
      </div>

      {/* Template Grid */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map(template => {
          const Icon = TYPE_ICONS[template.type] || LayoutTemplate
          const duration = durationLabel(template)
          const isExpanded = expandedTemplate === template.id

          return (
            <div
              key={template.id}
              className="group rounded-xl ring-1 ring-white/[0.06] bg-card overflow-hidden transition-all hover:ring-white/[0.12] hover:shadow-[0_4px_24px_rgba(0,0,0,0.2)]"
            >
              {/* Thumbnail area — clicking opens the detail panel */}
              <div
                className="relative aspect-video bg-muted/20 flex items-center justify-center overflow-hidden cursor-pointer"
                onClick={() => template.renderPath ? openVideo(template) : template.source !== 'repo' && navigate(`/templates/${template.id}`)}
              >
                {template.renderPath ? (
                  template.source === 'ai-generated' ? (
                    <video
                      src={`/api/templates/${template.id}/video`}
                      className="w-full h-full object-cover"
                      muted
                      loop
                      playsInline
                      onMouseEnter={(e) => (e.target as HTMLVideoElement).play()}
                      onMouseLeave={(e) => { const v = e.target as HTMLVideoElement; v.pause(); v.currentTime = 0 }}
                    />
                  ) : (
                    <video
                      src={mediaUrl(template.renderPath!)}
                      className="w-full h-full object-cover"
                      muted
                      loop
                      playsInline
                      onMouseEnter={(e) => (e.target as HTMLVideoElement).play()}
                      onMouseLeave={(e) => { const v = e.target as HTMLVideoElement; v.pause(); v.currentTime = 0 }}
                    />
                  )
                ) : template.thumbnail ? (
                  <img
                    src={`/api/generated/${template.thumbnail}`}
                    alt={template.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2.5 text-muted-foreground">
                    <Icon className={`h-8 w-8 ${TYPE_COLORS[template.type] || ''} opacity-30`} />
                    {template.source === 'repo' && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                        disabled={generatingThumb === template.id}
                        onClick={() => generateThumbnail(template)}
                      >
                        {generatingThumb === template.id ? (
                          <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Rendering...</>
                        ) : (
                          <><Camera className="h-3 w-3 mr-1" />Preview</>
                        )}
                      </Button>
                    )}
                  </div>
                )}

                {/* Bottom gradient fade */}
                <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-card to-transparent pointer-events-none" />

                {/* Badges overlay */}
                <div className="absolute top-2 left-2 flex gap-1">
                  <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-black/50 backdrop-blur-md ${TYPE_COLORS[template.type] || 'text-muted-foreground'}`}>
                    <Icon className="h-2.5 w-2.5" />{template.type}
                  </span>
                  {template.templateKind === 'parameterized' && template.compositionIds && (
                    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-black/50 backdrop-blur-md text-blue-300">
                      <Layers className="h-2.5 w-2.5" />{template.compositionIds.length}
                    </span>
                  )}
                </div>
                <div className="absolute top-2 right-2 flex gap-1">
                  {template.source === 'ai-generated' && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-black/50 backdrop-blur-md text-forge">
                      <Sparkles className="h-2.5 w-2.5 inline mr-0.5" />AI
                    </span>
                  )}
                  {template.source === 'repo' && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-black/50 backdrop-blur-md text-blue-300">
                      <GitBranch className="h-2.5 w-2.5 inline mr-0.5" />repo
                    </span>
                  )}
                </div>
                {duration && (
                  <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-black/50 backdrop-blur-md text-white/80">
                    {duration}
                  </span>
                )}
                {template.renderPath && (
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100 bg-black/20">
                    <span className="flex items-center gap-1.5 rounded-full bg-black/65 px-3 py-1.5 text-xs font-medium text-white shadow-lg backdrop-blur-md">
                      <Play className="h-3 w-3" /> Open video
                    </span>
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="p-3.5">
                <button
                  onClick={() => template.source !== 'repo' && navigate(`/templates/${template.id}`)}
                  className="text-left w-full"
                  disabled={template.source === 'repo'}
                >
                  <h3 className="font-semibold text-sm tracking-tight hover:text-forge transition-colors">{template.name}</h3>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">{template.description}</p>
                </button>

                {/* Instances (for parameterized templates) */}
                {template.instances && template.instances.length > 0 && (
                  <div className="mt-2.5">
                    <button
                      onClick={() => setExpandedTemplate(isExpanded ? null : template.id)}
                      className="text-[11px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                    >
                      <Layers className="h-2.5 w-2.5" />
                      {isExpanded ? 'Hide' : 'Show'} {template.instances.length} instances
                    </button>
                    {isExpanded && (
                      <div className="mt-2 space-y-1">
                        {template.instances.map(inst => (
                          <div key={inst.compositionId} className="flex items-center gap-2 text-[11px] px-2 py-1.5 rounded-md bg-muted/30 ring-1 ring-white/[0.04]">
                            {inst.renderPath ? (
                              <a href={`/api/media-files?path=${encodeURIComponent(inst.renderPath!)}`} target="_blank" rel="noopener noreferrer" className="shrink-0">
                                <Play className="h-2.5 w-2.5 text-violet-400 hover:text-violet-300" />
                              </a>
                            ) : (
                              <MonitorPlay className="h-2.5 w-2.5 text-violet-400 shrink-0" />
                            )}
                            <span className="font-medium">{inst.label}</span>
                            <span className="text-muted-foreground truncate flex-1">{String(inst.params.title || '')}</span>
                            {inst.renderPath && (
                              <a href={`/api/media-files?path=${encodeURIComponent(inst.renderPath!)}`} target="_blank" rel="noopener noreferrer"
                                className="text-muted-foreground hover:text-foreground shrink-0">
                                <ExternalLink className="h-2.5 w-2.5" />
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-1.5 mt-3">
                  {template.source === 'repo' && (
                    <div className={`grid w-full gap-1.5 ${template.renderPath ? 'grid-cols-3' : 'grid-cols-2'}`}>
                      <Button variant="outline" size="sm" className="text-xs" onClick={() => openInStudio(template)}>
                        <Play className="h-3 w-3 mr-1" />Editor
                      </Button>
                      {template.renderPath && (
                        <Button variant="outline" size="sm" className="text-xs" onClick={() => openVideo(template)}>
                          <ExternalLink className="h-3 w-3 mr-1" />Open
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        disabled={runningTemplate === template.id || !!runs[template.id] && runs[template.id].status === 'running'}
                        onClick={() => renderRepoTemplate(template)}
                      >
                        {runningTemplate === template.id || (runs[template.id]?.status === 'running')
                          ? <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          : <Camera className="h-3 w-3 mr-1" />}
                        {template.renderPath ? 'Re-render' : 'Render'}
                      </Button>
                    </div>
                  )}
                  {template.source !== 'repo' && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 text-xs"
                        disabled={runningTemplate === template.id || !!runs[template.id] && runs[template.id].status === 'running'}
                        onClick={() => runTemplate(template)}
                      >
                        {runningTemplate === template.id || (runs[template.id]?.status === 'running')
                          ? <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          : <Sparkles className="h-3 w-3 mr-1" />}
                        {template.renderPath ? 'Re-generate with Gemini' : 'Generate video with Gemini'}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => deleteTemplate(template.id)} className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </>
                  )}
                </div>
                {template.source !== 'repo' && template.compositionIds && template.compositionIds.length > 0 && (
                  <div className="flex items-center gap-1.5 mt-2">
                    <Button variant="ghost" size="sm" className="flex-1 text-[11px] h-7" onClick={() => openInStudio(template)}>
                      <MonitorPlay className="h-3 w-3 mr-1" />Open in Studio
                    </Button>
                    <Button variant="ghost" size="sm" className="flex-1 text-[11px] h-7" onClick={() => openCode(template)}>
                      <Code2 className="h-3 w-3 mr-1" />Open code
                    </Button>
                  </div>
                )}
                {runError?.id === template.id && (
                  <div className="mt-2 rounded-md bg-destructive/10 ring-1 ring-destructive/20 px-2 py-1.5 text-[10px] text-destructive">
                    {runError.msg}
                  </div>
                )}
                {runs[template.id] && (
                  <div className={`mt-2 rounded-md px-2 py-1.5 text-[10px] ring-1 ${
                    runs[template.id].status === 'done' ? 'bg-emerald-500/10 ring-emerald-500/20 text-emerald-300' :
                    runs[template.id].status === 'failed' ? 'bg-destructive/10 ring-destructive/20 text-destructive' :
                    'bg-amber-500/10 ring-amber-500/20 text-amber-300'
                  }`}>
                    <div className="flex items-center gap-1.5">
                      {runs[template.id].status === 'running' && <Loader2 className="h-2.5 w-2.5 animate-spin shrink-0" />}
                      <span className="font-medium capitalize">{runs[template.id].status}</span>
                      <span className="truncate font-mono opacity-80">{runs[template.id].tail}</span>
                    </div>
                    {runs[template.id].status === 'done' && template.renderPath && (
                      template.source === 'repo' ? (
                        <a
                          href="#"
                          onClick={(event) => {
                            event.preventDefault()
                            openVideo(template)
                          }}
                          className="mt-1 flex items-center gap-1 text-emerald-200 hover:text-emerald-100"
                        >
                          <Play className="h-2.5 w-2.5" /> Open rendered video
                        </a>
                      ) : (
                        <button
                          onClick={() => navigate(`/templates/${template.id}`)}
                          className="mt-1 flex items-center gap-1 text-emerald-200 hover:text-emerald-100"
                        >
                          <Play className="h-2.5 w-2.5" /> Open in detail panel
                        </button>
                      )
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
        {filtered.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center rounded-xl ring-1 ring-white/[0.04] bg-card p-12 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/50 ring-1 ring-white/[0.06]">
              <LayoutTemplate className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">No templates yet.</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Create one with the buttons above.</p>
          </div>
        )}
      </div>

      {selectedVideo && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Video preview for ${selectedVideo.title}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6 backdrop-blur-sm"
          onClick={() => setSelectedVideo(null)}
        >
          <div
            className="w-full max-w-6xl overflow-hidden rounded-xl bg-card ring-1 ring-white/[0.08] shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold">{selectedVideo.title}</h2>
                <p className="truncate text-[11px] font-mono text-muted-foreground">{selectedVideo.path}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedVideo(null)} aria-label="Close video preview">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <video
              src={selectedVideo.src}
              className="aspect-video w-full bg-black"
              controls
              autoPlay
              playsInline
            />
          </div>
        </div>
      )}
    </PageShell>
  )
}
