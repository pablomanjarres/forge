export interface Provider {
  id: string
  name: string
  enabled: boolean
  auth: 'cli' | 'keychain' | 'env'
  status: 'connected' | 'disconnected' | 'checking'
  keyName?: string
}

export interface Task {
  id: string
  provider: 'codex' | 'gemini'
  type: 'agent' | 'chat'
  prompt: string
  cwd?: string
  status: 'queued' | 'running' | 'done' | 'failed'
  output: OutputLine[]
  result?: unknown
  createdAt: string
  completedAt?: string
}

export interface OutputLine {
  role: string
  content: string
  timestamp: string
}

export interface MediaItem {
  id: string
  type: 'image' | 'video' | 'audio'
  provider: string
  model?: string
  prompt: string
  filePath: string
  width?: number
  height?: number
  duration?: number
  taskId?: string
  createdAt: string
}

export interface Repo {
  id: string
  name: string
  url: string
  localPath: string
  branch: string
  lastPull?: string
  createdAt: string
}

export type TemplateType = 'remotion' | 'demo-recording' | 'image-preset' | 'pipeline'

export interface Template {
  id: string
  name: string
  type: TemplateType
  description: string
  source: 'built-in' | 'repo' | 'ai-generated'
  repoId?: string
  entryPoint?: string
  params: {
    schema: Record<string, unknown>
    values: Record<string, unknown>
    steps?: PipelineStep[]
  }
  thumbnail?: string
  createdBy: 'user' | 'ai'
  createdAt: string
}

export interface PipelineStep {
  action: string
  provider: string
  prompt?: string
  params?: Record<string, unknown>
}

export interface ActivityEntry {
  id: string
  tool: string
  provider?: string
  params: Record<string, unknown>
  status: 'pending' | 'running' | 'done' | 'failed'
  result?: unknown
  source: string
  timestamp: string
}
