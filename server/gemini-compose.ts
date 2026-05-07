import { GoogleGenAI } from '@google/genai'
import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import { augmentedEnv, resolveBin } from './bin-path.js'
import { getSkillContent } from './skills.js'

export interface ComposeResult {
  componentName: string
  componentCode: string
  compositionId: string
  durationInFrames: number
  fps: number
  width: number
  height: number
  description?: string
}

// Force Gemini to return structured JSON matching exactly the fields we need.
const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    componentName: { type: 'string', description: 'PascalCase component name' },
    componentCode: { type: 'string', description: 'Full .tsx file contents; default export the component' },
    compositionId: { type: 'string', description: 'kebab-case composition id (lowercase, digits, hyphens only — NO underscores)' },
    durationInFrames: { type: 'integer' },
    fps: { type: 'integer' },
    width: { type: 'integer' },
    height: { type: 'integer' },
    description: { type: 'string' },
  },
  required: ['componentName', 'componentCode', 'compositionId', 'durationInFrames', 'fps', 'width', 'height'],
}

// Remotion only accepts [a-zA-Z0-9-] in composition ids.
function sanitizeCompositionId(raw: string, fallback: string): string {
  const cleaned = raw.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')
  return cleaned || fallback
}

function loadExampleScene(remotionDir: string): string {
  // One concrete scene is enough to show Gemini the style + imports pattern.
  const candidates = [
    'src/scenes/features/GraphVideo.tsx',
    'src/scenes/features/RagIndexingVideo.tsx',
    'src/scenes/features/ContextTrackingVideo.tsx',
  ]
  for (const rel of candidates) {
    const abs = path.join(remotionDir, rel)
    if (fs.existsSync(abs)) {
      return `// Example — ${rel}\n` + fs.readFileSync(abs, 'utf-8').slice(0, 6000)
    }
  }
  return ''
}

function buildSystemInstruction(remotionDir: string, skillNames: string[]): string {
  const skillBlocks: string[] = []
  for (const name of skillNames) {
    const md = getSkillContent(name)
    if (md) skillBlocks.push(`<skill name="${name}">\n${md}\n</skill>`)
  }
  const exampleScene = loadExampleScene(remotionDir)

  return [
    'You are a Remotion composition generator for the Forge AI orchestration center.',
    'You produce a single self-contained React/TypeScript component that Remotion can render.',
    '',
    'HARD CONSTRAINTS:',
    '- Output a valid default-exported React FC.',
    '- Imports: only from "react", "remotion" (AbsoluteFill, Sequence, interpolate, useCurrentFrame, useVideoConfig, spring, Easing, Img, Audio, Video).',
    '- Do NOT import from any other package or local file — the renderer ships an isolated entry file.',
    '- Keep durationInFrames <= 900 and fps in {30, 60}.',
    '- Prefer 1920x1080 canvas unless the user asks otherwise.',
    '- Use AbsoluteFill for full-canvas layers. Animate with interpolate + useCurrentFrame.',
    '- No external fonts beyond system sans-serif. No network resources.',
    '- compositionId MUST match /^[a-z0-9-]+$/ — lowercase letters, digits, and hyphens only. NO underscores, NO capitals, NO spaces.',
    '',
    'Return JSON matching the schema — componentCode must be the full .tsx file string.',
    '',
    skillBlocks.length ? '=== RELEVANT SKILLS ===\n' + skillBlocks.join('\n\n') : '',
    exampleScene ? '\n=== EXAMPLE SCENE FROM PROJECT ===\n```tsx\n' + exampleScene + '\n```' : '',
  ].filter(Boolean).join('\n')
}

export async function modifyRemotionComposition(
  apiKey: string,
  opts: {
    compositionId: string
    currentCode: string
    modificationRequest: string
    model?: string
    remotionDir: string
    skillNames?: string[]
  },
): Promise<ComposeResult> {
  const ai = new GoogleGenAI({ apiKey })
  const systemInstruction = [
    buildSystemInstruction(opts.remotionDir, opts.skillNames || ['remotion']),
    '',
    '=== MODIFICATION MODE ===',
    'You are modifying an existing composition. Preserve the compositionId and overall structure.',
    'Apply ONLY the requested change. Return the full updated file.',
  ].join('\n')

  const contents = [
    `Existing compositionId: ${opts.compositionId}`,
    `User modification request: ${opts.modificationRequest}`,
    '',
    'Current composition.tsx:',
    '```tsx',
    opts.currentCode,
    '```',
    '',
    'Return the updated JSON with componentCode containing the full modified file.',
  ].join('\n')

  const response = await ai.models.generateContent({
    model: opts.model || 'gemini-2.5-pro',
    contents,
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA as any,
    },
  })

  const text = response.text || '{}'
  let parsed: any
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error(`Gemini returned non-JSON response: ${text.slice(0, 200)}`)
  }
  // Force the existing compositionId through so the file location stays stable.
  parsed.compositionId = opts.compositionId
  return parsed as ComposeResult
}

export async function generateRemotionComposition(
  apiKey: string,
  opts: {
    description: string
    templateId: string
    model?: string
    remotionDir: string
    skillNames?: string[]
  },
): Promise<ComposeResult> {
  const ai = new GoogleGenAI({ apiKey })
  const systemInstruction = buildSystemInstruction(opts.remotionDir, opts.skillNames || ['remotion'])

  const response = await ai.models.generateContent({
    model: opts.model || 'gemini-2.5-pro',
    contents: [
      `Create a Remotion composition for this template (id: ${opts.templateId}):`,
      '',
      opts.description,
      '',
      'Return JSON as specified.',
    ].join('\n'),
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA as any,
    },
  })

  const text = response.text || '{}'
  let parsed: any
  try {
    parsed = JSON.parse(text)
  } catch (err) {
    throw new Error(`Gemini returned non-JSON response: ${text.slice(0, 200)}`)
  }

  const required = ['componentName', 'componentCode', 'compositionId', 'durationInFrames', 'fps', 'width', 'height']
  for (const k of required) {
    if (parsed[k] === undefined) throw new Error(`Gemini response missing field: ${k}`)
  }
  parsed.compositionId = sanitizeCompositionId(String(parsed.compositionId), `ai-${opts.templateId}`)
  return parsed as ComposeResult
}

// Writes the composition code + a self-contained entry file, then runs
// `remotion render`. The entry file registers a Root with only this single
// composition, so we never touch the project's Root.tsx and can render any
// ID in parallel without clashes.
export interface RenderOptions {
  remotionDir: string
  composition: ComposeResult
  onStdout?: (chunk: string) => void
}

export async function writeAndRender(opts: RenderOptions): Promise<{ outputPath: string; relativePath: string }> {
  const { remotionDir, composition: c, onStdout } = opts

  const aiDir = path.join(remotionDir, 'src', 'ai-generated', c.compositionId)
  fs.mkdirSync(aiDir, { recursive: true })

  const compositionFile = path.join(aiDir, 'composition.tsx')
  fs.writeFileSync(compositionFile, c.componentCode, 'utf-8')

  const entryFile = path.join(aiDir, 'entry.tsx')
  fs.writeFileSync(entryFile, buildEntryFile(c), 'utf-8')

  const outDir = path.join(remotionDir, 'out', 'ai-generated')
  fs.mkdirSync(outDir, { recursive: true })
  const outputPath = path.join(outDir, `${c.compositionId}.mp4`)

  const entryRel = path.relative(remotionDir, entryFile)
  await runRemotionRender(remotionDir, entryRel, c.compositionId, outputPath, onStdout)

  return {
    outputPath,
    relativePath: path.relative(path.join(remotionDir, '..'), outputPath),
  }
}

function buildEntryFile(c: ComposeResult): string {
  return `// Auto-generated by Forge — do not edit.
import React from 'react';
import {Composition, registerRoot} from 'remotion';
import Component from './composition';

const Root: React.FC = () => (
  <>
    <Composition
      id="${c.compositionId}"
      component={Component as any}
      durationInFrames={${c.durationInFrames}}
      fps={${c.fps}}
      width={${c.width}}
      height={${c.height}}
    />
  </>
);

registerRoot(Root);
`
}

// Render whatever is already on disk for a composition — used by the "re-render"
// button after manual edits (Studio, external editor, etc.) with no Gemini roundtrip.
export async function renderExisting(opts: {
  remotionDir: string
  compositionId: string
  onStdout?: (chunk: string) => void
}): Promise<{ outputPath: string; relativePath: string }> {
  const aiDir = path.join(opts.remotionDir, 'src', 'ai-generated', opts.compositionId)
  const entryRel = path.relative(opts.remotionDir, path.join(aiDir, 'entry.tsx'))
  if (!fs.existsSync(path.join(opts.remotionDir, entryRel))) {
    throw new Error(`entry.tsx missing at ${entryRel}`)
  }
  const outDir = path.join(opts.remotionDir, 'out', 'ai-generated')
  fs.mkdirSync(outDir, { recursive: true })
  const outputPath = path.join(outDir, `${opts.compositionId}.mp4`)
  await runRemotionRender(opts.remotionDir, entryRel, opts.compositionId, outputPath, opts.onStdout)
  return {
    outputPath,
    relativePath: path.relative(path.join(opts.remotionDir, '..'), outputPath),
  }
}

function runRemotionRender(
  cwd: string,
  entryRel: string,
  compositionId: string,
  outputPath: string,
  onStdout?: (chunk: string) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(resolveBin('npx'), [
      'remotion', 'render',
      entryRel,
      compositionId,
      outputPath,
      '--log=info',
    ], {
      cwd,
      stdio: 'pipe',
      env: augmentedEnv({ BROWSER: 'none' }),
    })

    proc.stdout?.on('data', (chunk: Buffer) => onStdout?.(chunk.toString()))
    proc.stderr?.on('data', (chunk: Buffer) => onStdout?.(chunk.toString()))
    proc.on('error', reject)
    proc.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`remotion render exited with code ${code}`))
    })
  })
}
