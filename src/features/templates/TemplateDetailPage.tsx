import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { PageShell } from '@/components/shared/PageShell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ArrowLeft, Send, Loader2, Sparkles, MonitorPlay, Code2, GitFork, RefreshCw } from 'lucide-react'

interface Template {
  id: string
  name: string
  type: string
  description: string
  source: string
  compositionIds?: string[]
  renderPath?: string | null
  fps?: number
  width?: number
  height?: number
  durationInFrames?: number
  forkedFrom?: string
}

interface ChatTurn {
  id: string
  templateId: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

export function TemplateDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [template, setTemplate] = useState<Template | null>(null)
  const [chat, setChat] = useState<ChatTurn[]>([])
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [modifyStatus, setModifyStatus] = useState<{ tail: string; status: 'running' | 'done' | 'failed' } | null>(null)
  const [videoKey, setVideoKey] = useState(0)
  const [forkPrompt, setForkPrompt] = useState('')
  const [forking, setForking] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!id) return
    fetch(`/api/templates/${id}`).then(r => r.json()).then(setTemplate).catch(() => {})
    fetch(`/api/templates/${id}/chat`).then(r => r.json()).then(setChat).catch(() => {})
  }, [id])

  useEffect(() => {
    if (!id) return
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${location.host}/ws`)
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      if (msg.templateId !== id) return
      if (msg.type === 'template_chat') {
        setChat(prev => prev.some(c => c.id === msg.data.id) ? prev : [...prev, msg.data])
      }
      if (msg.type === 'template_updated') {
        setTemplate(prev => prev ? { ...prev, ...msg.data } : msg.data)
        setVideoKey(k => k + 1)
      }
      if (msg.type === 'agent_output' && msg.data?.content) {
        setModifyStatus(s => ({ tail: String(msg.data.content).split('\n').filter(Boolean).pop() || '', status: s?.status === 'done' ? 'running' : (s?.status || 'running') }))
      }
      if (msg.type === 'agent_status') {
        setModifyStatus(s => s ? { ...s, status: msg.status } : { tail: '', status: msg.status })
        if (msg.status !== 'running') setSending(false)
      }
    }
    return () => ws.close()
  }, [id])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chat])

  const send = async () => {
    if (!message.trim() || !template) return
    setSending(true)
    setModifyStatus({ tail: 'Asking Gemini...', status: 'running' })
    const msg = message.trim()
    setMessage('')
    try {
      const res = await fetch(`/api/templates/${template.id}/modify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setModifyStatus({ tail: err.error || `HTTP ${res.status}`, status: 'failed' })
        setSending(false)
      }
    } catch (err) {
      setModifyStatus({ tail: String(err), status: 'failed' })
      setSending(false)
    }
  }

  const fork = async () => {
    if (!forkPrompt.trim() || !template) return
    setForking(true)
    try {
      const res = await fetch(`/api/templates/${template.id}/fork`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ focus: forkPrompt.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error || `HTTP ${res.status}`)
        return
      }
      navigate(`/templates/${data.templateId}`)
    } finally {
      setForking(false)
      setForkPrompt('')
    }
  }

  const openInStudio = () => {
    if (!template) return
    navigate(`/editor?template=${template.id}`)
  }

  const openCode = async () => {
    if (!template) return
    await fetch(`/api/templates/${template.id}/open-code`, { method: 'POST' })
  }

  const [rerendering, setRerendering] = useState(false)
  const rerender = async () => {
    if (!template) return
    setRerendering(true)
    setModifyStatus({ tail: 'Re-rendering...', status: 'running' })
    try {
      const res = await fetch(`/api/templates/${template.id}/rerender`, { method: 'POST' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setModifyStatus({ tail: err.error || `HTTP ${res.status}`, status: 'failed' })
      }
    } catch (err) {
      setModifyStatus({ tail: String(err), status: 'failed' })
    } finally {
      setRerendering(false)
    }
  }

  if (!template) {
    return (
      <PageShell>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate('/templates')}>
            <ArrowLeft className="h-4 w-4 mr-1" />Back
          </Button>
        </div>
        <div className="text-sm text-muted-foreground mt-4">Loading...</div>
      </PageShell>
    )
  }

  const hasVideo = !!template.compositionIds?.length && !!template.renderPath

  return (
    <PageShell>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="ghost" size="sm" onClick={() => navigate('/templates')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight truncate">{template.name}</h1>
            <p className="text-xs text-muted-foreground truncate">{template.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {hasVideo && (
            <>
              <Button variant="ghost" size="sm" onClick={openInStudio}>
                <MonitorPlay className="h-3.5 w-3.5 mr-1" />Studio
              </Button>
              <Button variant="ghost" size="sm" onClick={openCode}>
                <Code2 className="h-3.5 w-3.5 mr-1" />Code
              </Button>
              <Button variant="outline" size="sm" onClick={rerender} disabled={rerendering || modifyStatus?.status === 'running'}>
                {rerendering ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
                Re-render
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-4 mt-2">
        {/* Video + fork */}
        <div className="space-y-4">
          <div className="rounded-xl ring-1 ring-white/[0.06] bg-black overflow-hidden aspect-video">
            {hasVideo ? (
              <video
                key={videoKey}
                src={`/api/templates/${template.id}/video?t=${videoKey}`}
                controls
                autoPlay={false}
                className="w-full h-full"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
                No video yet — generate one from the Templates page.
              </div>
            )}
          </div>

          {/* Create variation from this template */}
          <div className="rounded-xl ring-1 ring-white/[0.06] bg-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <GitFork className="h-4 w-4 text-forge" />
              <h3 className="font-semibold text-sm">Create video from this template</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Fork this template with a focused prompt — inherits the base idea, adjusts the focus.
            </p>
            <div className="flex gap-2">
              <Input
                value={forkPrompt}
                onChange={(e) => setForkPrompt(e.target.value)}
                placeholder="e.g. same flow but with a darker palette, for a landing page hero"
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); fork() } }}
                className="text-sm"
              />
              <Button onClick={fork} disabled={forking || !forkPrompt.trim()}>
                {forking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {template.forkedFrom && (
            <button
              onClick={() => navigate(`/templates/${template.forkedFrom}`)}
              className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <GitFork className="h-3 w-3" />Forked from {template.forkedFrom}
            </button>
          )}
        </div>

        {/* Chat */}
        <div className="rounded-xl ring-1 ring-white/[0.06] bg-card flex flex-col min-h-[480px] lg:min-h-0 lg:h-[calc(100vh-160px)]">
          <div className="px-4 py-3 border-b border-white/[0.06]">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-forge" />Modify with Gemini
            </h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Each message re-renders the video with your change.
            </p>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 min-h-0">
            {chat.length === 0 && (
              <p className="text-xs text-muted-foreground/70 italic">
                Ask Gemini to tweak anything — "darker background", "add a second row of nodes", etc.
              </p>
            )}
            {chat.map(turn => (
              <div
                key={turn.id}
                className={`text-xs rounded-lg px-3 py-2 ${
                  turn.role === 'user'
                    ? 'bg-forge/10 ring-1 ring-forge/20 text-foreground ml-6'
                    : 'bg-muted/30 ring-1 ring-white/[0.04] text-foreground mr-6'
                }`}
              >
                {turn.content}
              </div>
            ))}
            {modifyStatus && (
              <div className={`text-[11px] rounded-md px-2 py-1.5 ring-1 mr-6 ${
                modifyStatus.status === 'done' ? 'bg-emerald-500/10 ring-emerald-500/20 text-emerald-300' :
                modifyStatus.status === 'failed' ? 'bg-destructive/10 ring-destructive/20 text-destructive' :
                'bg-amber-500/10 ring-amber-500/20 text-amber-300'
              }`}>
                <div className="flex items-center gap-1.5">
                  {modifyStatus.status === 'running' && <Loader2 className="h-2.5 w-2.5 animate-spin shrink-0" />}
                  <span className="font-medium capitalize">{modifyStatus.status}</span>
                  <span className="truncate font-mono opacity-80">{modifyStatus.tail}</span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="border-t border-white/[0.06] p-3">
            <div className="flex gap-2">
              <Input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={hasVideo ? 'Describe a change...' : 'Generate a video first'}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                disabled={!hasVideo || sending}
                className="text-sm"
              />
              <Button onClick={send} disabled={!hasVideo || sending || !message.trim()}>
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  )
}
