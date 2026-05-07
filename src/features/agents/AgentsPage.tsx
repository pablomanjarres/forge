import { useState, useEffect, useRef } from 'react'
import { PageShell } from '@/components/shared/PageShell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Cpu, Sparkles, Play, Square, Loader2 } from 'lucide-react'

interface Task {
  id: string
  provider: string
  prompt: string
  status: string
  output: { role: string; content: string; timestamp: string }[]
  createdAt: string
}

export function AgentsPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [selectedTask, setSelectedTask] = useState<string | null>(null)
  const [prompt, setPrompt] = useState('')
  const [provider, setProvider] = useState<'codex' | 'gemini'>('codex')
  const [cwd, setCwd] = useState('')
  const [launching, setLaunching] = useState(false)
  const outputRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/tasks').then(r => r.json()).then(setTasks).catch(() => {})
  }, [])

  // WebSocket for real-time updates
  useEffect(() => {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${location.host}/ws`)

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      if (msg.type === 'task_created') {
        setTasks(prev => [msg.data, ...prev])
      }
      if (msg.type === 'agent_output' && msg.taskId) {
        setTasks(prev => prev.map(t =>
          t.id === msg.taskId
            ? { ...t, output: [...t.output, msg.data] }
            : t
        ))
      }
      if (msg.type === 'agent_status' && msg.taskId) {
        setTasks(prev => prev.map(t =>
          t.id === msg.taskId ? { ...t, status: msg.status } : t
        ))
      }
    }

    return () => ws.close()
  }, [])

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [tasks, selectedTask])

  const launchTask = async () => {
    if (!prompt.trim()) return
    setLaunching(true)
    try {
      const res = await fetch('/api/tasks/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, provider, cwd: cwd || undefined }),
      })
      const task = await res.json()
      setSelectedTask(task.id)
      setPrompt('')
    } catch (err) {
      console.error(err)
    } finally {
      setLaunching(false)
    }
  }

  const cancelTask = async (id: string) => {
    await fetch(`/api/tasks/${id}/cancel`, { method: 'POST' })
  }

  const selected = tasks.find(t => t.id === selectedTask)

  return (
    <PageShell>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Agents</h1>
        <p className="text-muted-foreground mt-1">Launch Codex and Gemini tasks, stream output in real-time.</p>
      </div>

      {/* Launch Form */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="font-semibold mb-4">Launch Task</h3>
        <div className="space-y-3">
          <div className="flex gap-2">
            <button
              onClick={() => setProvider('codex')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                provider === 'codex' ? 'bg-foreground text-background' : 'bg-secondary text-muted-foreground hover:text-foreground'
              }`}
            >
              <Cpu className="h-4 w-4" />Codex
            </button>
            <button
              onClick={() => setProvider('gemini')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                provider === 'gemini' ? 'bg-foreground text-background' : 'bg-secondary text-muted-foreground hover:text-foreground'
              }`}
            >
              <Sparkles className="h-4 w-4" />Gemini
            </button>
          </div>
          <div>
            <Label htmlFor="agent-prompt">Prompt</Label>
            <textarea
              id="agent-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={provider === 'codex' ? "Describe the code task..." : "Ask Gemini anything..."}
              rows={3}
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              onKeyDown={(e) => { if (e.key === 'Enter' && e.metaKey) launchTask() }}
            />
          </div>
          {provider === 'codex' && (
            <div>
              <Label htmlFor="agent-cwd">Working Directory (optional)</Label>
              <Input
                id="agent-cwd"
                value={cwd}
                onChange={(e) => setCwd(e.target.value)}
                placeholder="/path/to/repo"
                className="mt-1 font-mono text-xs"
              />
            </div>
          )}
          <Button onClick={launchTask} disabled={launching || !prompt.trim()}>
            {launching ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
            Launch
          </Button>
        </div>
      </div>

      {/* Task List + Output */}
      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        {/* Task List */}
        <div className="rounded-xl border border-border bg-card p-3 max-h-[500px] overflow-y-auto">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-2 mb-2">Tasks</p>
          {tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground px-2">No tasks yet.</p>
          ) : (
            <div className="space-y-1">
              {tasks.map(task => (
                <button
                  key={task.id}
                  onClick={() => setSelectedTask(task.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    selectedTask === task.id ? 'bg-secondary' : 'hover:bg-secondary/50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {task.provider === 'codex' ? <Cpu className="h-3 w-3 shrink-0" /> : <Sparkles className="h-3 w-3 shrink-0" />}
                    <span className="truncate">{(task.prompt || '(no prompt)').slice(0, 40)}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-xs ${
                      task.status === 'running' ? 'text-amber-500' :
                      task.status === 'done' ? 'text-emerald-500' : 'text-red-500'
                    }`}>
                      {task.status === 'running' && '●'} {task.status}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Output Terminal */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-border">
            <p className="text-xs font-mono text-muted-foreground">
              {selected ? `${selected.provider} — ${selected.status}` : 'Select a task'}
            </p>
            {selected?.status === 'running' && (
              <Button variant="ghost" size="sm" onClick={() => cancelTask(selected.id)}>
                <Square className="h-3 w-3 mr-1" />Stop
              </Button>
            )}
          </div>
          <div ref={outputRef} className="p-4 max-h-[400px] overflow-y-auto font-mono text-xs">
            {selected?.output.length ? (
              selected.output.map((line, i) => (
                <div key={i} className="mb-1">
                  <span className={line.role === 'error' ? 'text-red-400' : 'text-foreground'}>
                    {line.content}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground">No output yet.</p>
            )}
          </div>
        </div>
      </div>
    </PageShell>
  )
}
