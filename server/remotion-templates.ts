import fs from 'fs'
import path from 'path'

export interface TemplateInstance {
  compositionId: string
  label: string
  params: Record<string, unknown>
  /** Path to rendered video relative to media root */
  renderPath?: string
}

export interface RemotionTemplate {
  id: string
  name: string
  type: 'remotion'
  source: 'repo'
  description: string
  templateKind: 'parameterized' | 'standalone'
  compositionIds: string[]
  projectPath: string
  fps: number
  width: number
  height: number
  durationInFrames: number
  thumbnail: string | null
  /** Absolute path to a rendered video, if it exists on disk */
  renderPath: string | null
  instances?: TemplateInstance[]
  parameterSchema?: Record<string, { type: string; description: string; enum?: string[] }>
  createdBy: string
  createdAt: string
  params: { schema: Record<string, unknown>; values: Record<string, unknown> }
}

const FEATURE_VIDEO_INSTANCES: TemplateInstance[] = [
  {
    compositionId: 'RagIndexing',
    label: 'RAG Indexing',
    renderPath: 'videos/rendered/features/codebase-search/current.mp4',
    params: {
      title: 'Ground every answer in real code',
      subtitle: 'AST-aware chunking with hybrid semantic + BM25 search',
      terminalSubtitle: 'code intelligence',
      cursorColor: 'greenStart',
    },
  },
  {
    compositionId: 'ContextTracking',
    label: 'Context Tracking',
    renderPath: 'videos/rendered/features/context-tracking/current.mp4',
    params: {
      title: 'Agents that remember across turns',
      subtitle: 'Context survives across sessions',
      terminalSubtitle: 'context tracking',
      cursorColor: 'cyan',
    },
  },
  {
    compositionId: 'AssumptionTracking',
    label: 'Assumption Tracking',
    renderPath: 'videos/rendered/features/assumption-tracking/current.mp4',
    params: {
      title: 'Catch contradictions before they ship',
      subtitle: 'Auto-invalidation when related files change',
      terminalSubtitle: 'assumption tracking',
      cursorColor: 'purple',
    },
  },
  {
    compositionId: 'DependencyTracking',
    label: 'Dependency Tracking',
    renderPath: 'videos/rendered/features/dependency-tracking/current.mp4',
    params: {
      title: 'Detect drift before it breaks you',
      subtitle: 'Hash-based monitoring of package.json and lockfiles',
      terminalSubtitle: 'dependency tracking',
      cursorColor: 'orange',
    },
  },
  {
    compositionId: 'SemanticSearch',
    label: 'Semantic Search',
    renderPath: 'videos/rendered/features/semantic-search/current.mp4',
    params: {
      title: 'Find code by meaning, not just keywords',
      subtitle: null,
      terminalSubtitle: 'hybrid search',
      cursorColor: 'greenStart',
    },
  },
  {
    compositionId: 'PromptInjection',
    label: 'Prompt Injection Defense',
    renderPath: 'videos/rendered/features/prompt-injection/current.mp4',
    params: {
      title: 'Search results your agent can trust',
      subtitle: '5-layer defense against prompt injection',
      terminalSubtitle: 'prompt injection defense',
      cursorColor: 'red',
    },
  },
]

interface TemplateDef {
  id: string
  name: string
  description: string
  templateKind: 'parameterized' | 'standalone'
  compositionIds: string[]
  defaultCompositionId: string
  defaultThumbnailFrame: number
  /** Path to rendered video relative to media root (~/Projects/media/) */
  renderPath?: string
  instances?: TemplateInstance[]
  parameterSchema?: Record<string, { type: string; description: string; enum?: string[] }>
}

const TEMPLATE_DEFINITIONS: TemplateDef[] = [
  {
    id: 'remotion-nella-feature',
    name: 'Nella Feature Video',
    description: 'Animated terminal demo video for a single Nella feature. Opens directly on active terminal evidence with title/subtitle context over the action. 8 seconds at 60fps, 1920x1080.',
    templateKind: 'parameterized',
    compositionIds: ['RagIndexing', 'ContextTracking', 'AssumptionTracking', 'DependencyTracking', 'SemanticSearch', 'PromptInjection'],
    defaultCompositionId: 'RagIndexing',
    defaultThumbnailFrame: 0,
    renderPath: 'videos/rendered/features/codebase-search/current.mp4',
    instances: FEATURE_VIDEO_INSTANCES,
    parameterSchema: {
      title: { type: 'string', description: 'Main heading displayed above the terminal' },
      subtitle: { type: 'string', description: 'Secondary text below the title' },
      terminalSubtitle: { type: 'string', description: 'Label shown in the terminal header' },
      cursorColor: {
        type: 'string',
        description: 'Terminal cursor color from the Nella palette',
        enum: ['greenStart', 'cyan', 'purple', 'orange', 'red', 'yellow', 'blue'],
      },
      terminalLines: { type: 'array', description: 'Array of { text, color?, indent?, delay } objects defining terminal output' },
    },
  },
  {
    id: 'remotion-nella-demo',
    name: 'Nella Full Demo',
    description: 'Complete product demo video assembling 8 scenes with fade transitions: hook, intro, pillar overview, indexing, hallucinations, context loss, pipeline, and outro. 43.2 seconds at 60fps, 1920x1080.',
    templateKind: 'standalone',
    compositionIds: ['NellaDemo'],
    defaultCompositionId: 'NellaDemo',
    defaultThumbnailFrame: 45,
    renderPath: 'videos/rendered/demos/nella-demo/current.mp4',
  },
  {
    id: 'remotion-nella-agent-benchmark',
    name: 'Nella Agent Benchmark',
    description: 'Launch-ready feature video showing Nella benchmark evaluation for multi-turn prompt-injection attacks, cross-model comparison, and uploaded evidence. Opens on the attack run instead of a slow intro. 18 seconds at 60fps, 1920x1080.',
    templateKind: 'standalone',
    compositionIds: ['AgentBenchmark'],
    defaultCompositionId: 'AgentBenchmark',
    defaultThumbnailFrame: 0,
    renderPath: 'videos/rendered/features/agent-benchmark/current.mp4',
  },
  {
    id: 'remotion-graph',
    name: 'Architecture Graph',
    description: 'C4-style architecture visualization with animated nodes, edges, group bounding boxes, and circular dependency detection visible from frame 0. Custom SVG graph rendering with spring animations. 8 seconds at 60fps, 1920x1080.',
    templateKind: 'standalone',
    compositionIds: ['Graph'],
    defaultCompositionId: 'Graph',
    defaultThumbnailFrame: 0,
    renderPath: 'videos/rendered/features/architecture-graph/current.mp4',
  },
  {
    id: 'remotion-workflow-pipeline',
    name: 'Workflow Pipeline',
    description: 'n8n-style automation canvas for explaining triggers, AI steps, review gates, renders, and publishing handoffs. Opens mid-flow so frame 0 already shows the pipeline. 12 seconds at 60fps, 1920x1080.',
    templateKind: 'standalone',
    compositionIds: ['WorkflowPipelineTemplate'],
    defaultCompositionId: 'WorkflowPipelineTemplate',
    defaultThumbnailFrame: 0,
    renderPath: 'videos/rendered/templates/workflow-pipeline/current.mp4',
  },
  {
    id: 'remotion-claude-terminal',
    name: 'Claude Terminal',
    description: 'Claude Code CLI boot surface with source-derived orange Clawd mark, version/model/context lines, prompt cursor, shortcut hint, tool chips, effort status, and folder chip visible from frame 0. 12 seconds at 60fps, 1920x1080.',
    templateKind: 'standalone',
    compositionIds: ['ClaudeTerminalTemplate'],
    defaultCompositionId: 'ClaudeTerminalTemplate',
    defaultThumbnailFrame: 0,
    renderPath: 'videos/rendered/templates/claude-terminal/current.mp4',
  },
  {
    id: 'remotion-claude-ide',
    name: 'Claude IDE',
    description: 'Claude Code desktop app scene with left nav, routines, recents, central chat transcript, composer, and right-side Plan plus Terminal panes visible from frame 0. 12 seconds at 60fps, 1920x1080.',
    templateKind: 'standalone',
    compositionIds: ['ClaudeIdeTemplate'],
    defaultCompositionId: 'ClaudeIdeTemplate',
    defaultThumbnailFrame: 0,
    renderPath: 'videos/rendered/templates/claude-ide/current.mp4',
  },
]

export function scanRemotionTemplates(projectDir: string, dataDir: string): RemotionTemplate[] {
  const rootFile = path.join(projectDir, 'src', 'Root.tsx')
  if (!fs.existsSync(rootFile)) return []

  const content = fs.readFileSync(rootFile, 'utf-8')
  const rootMtime = fs.statSync(rootFile).mtime.toISOString()

  // Extract all composition IDs and their numeric props from Root.tsx
  const compositions = new Map<string, { fps: number; width: number; height: number; durationInFrames: number }>()
  const compRegex = /<Composition\s[^>]*?\/>/gs
  let match
  while ((match = compRegex.exec(content)) !== null) {
    const block = match[0]
    const id = block.match(/id="([^"]+)"/)?.[1]
    if (!id) continue

    const resolveNum = (prop: string): number => {
      const literal = block.match(new RegExp(`${prop}=\\{(\\d+)\\}`))?.[1]
      if (literal) return parseInt(literal, 10)
      const varName = block.match(new RegExp(`${prop}=\\{(\\w+)\\}`))?.[1]
      if (varName) {
        const constMatch = content.match(new RegExp(`const\\s+${varName}\\s*=\\s*(\\d+)`))
        if (constMatch) return parseInt(constMatch[1], 10)
      }
      return 0
    }

    compositions.set(id, {
      fps: resolveNum('fps'),
      width: resolveNum('width'),
      height: resolveNum('height'),
      durationInFrames: resolveNum('durationInFrames'),
    })
  }

  // Map template definitions to actual templates, only if their compositions exist
  const templates: RemotionTemplate[] = []

  for (const def of TEMPLATE_DEFINITIONS) {
    const foundIds = def.compositionIds.filter(id => compositions.has(id))
    if (foundIds.length === 0) continue

    const primary = compositions.get(def.defaultCompositionId) || compositions.get(foundIds[0])!

    // Check for existing thumbnail
    const thumbPath = path.join(dataDir, 'generated', `thumb-${def.id}.png`)
    const thumbnail = fs.existsSync(thumbPath) ? `thumb-${def.id}.png` : null

    // Check for existing rendered video in ~/Projects/media/
    const mediaRoot = path.join(process.env.HOME || '', 'Projects', 'media')
    const renderAbsPath = def.renderPath ? path.join(mediaRoot, def.renderPath) : null
    const renderPath = renderAbsPath && fs.existsSync(renderAbsPath) ? def.renderPath : null

    // Resolve instance render paths too
    const resolvedInstances = def.instances?.map(inst => ({
      ...inst,
      renderPath: inst.renderPath && fs.existsSync(path.join(mediaRoot, inst.renderPath))
        ? inst.renderPath : undefined,
    }))

    templates.push({
      id: def.id,
      name: def.name,
      type: 'remotion',
      source: 'repo',
      description: def.description,
      templateKind: def.templateKind,
      compositionIds: foundIds,
      projectPath: projectDir,
      fps: primary.fps,
      width: primary.width,
      height: primary.height,
      durationInFrames: primary.durationInFrames,
      thumbnail,
      renderPath,
      instances: resolvedInstances,
      parameterSchema: def.parameterSchema,
      createdBy: 'remotion-scan',
      createdAt: rootMtime,
      params: { schema: {}, values: {} },
    })
  }

  return templates
}

export function getTemplateDefinition(templateId: string): TemplateDef | undefined {
  return TEMPLATE_DEFINITIONS.find(d => d.id === templateId)
}
