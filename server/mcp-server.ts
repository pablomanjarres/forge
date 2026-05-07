#!/usr/bin/env node

// Forge MCP Server — Standalone stdio server for Claude Code integration
// Register with: claude mcp add forge -- node /Users/pablo/Projects/forge/server/mcp-server.ts

const FORGE_URL = process.env.FORGE_URL || 'http://localhost:3400'

interface ToolResult {
  content: { type: string; text: string }[]
}

async function forgeApi(path: string, method = 'GET', body?: unknown): Promise<unknown> {
  const res = await fetch(`${FORGE_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  return res.json()
}

// MCP protocol implementation via stdio
const tools = [
  {
    name: 'forge_generate_image',
    description: 'Generate an image using Gemini Imagen or other providers. Returns the file path of the generated image.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Description of the image to generate' },
        provider: { type: 'string', enum: ['gemini'], default: 'gemini' },
        model: { type: 'string', description: 'Model to use (optional)' },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'forge_generate_video',
    description: 'Generate a video using Gemini Veo. Returns the file path. Takes 1-3 minutes.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Description of the video scene' },
        provider: { type: 'string', enum: ['gemini'], default: 'gemini' },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'forge_generate_audio',
    description: 'Generate speech audio using Gemini TTS or ElevenLabs.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to convert to speech' },
        provider: { type: 'string', enum: ['gemini', 'elevenlabs'], default: 'gemini' },
        voiceName: { type: 'string', description: 'Voice name (e.g., Kore, Charon, Puck)' },
      },
      required: ['text'],
    },
  },
  {
    name: 'forge_edit_image',
    description: 'Edit an existing image using Qwen-Edit via RunPod.',
    inputSchema: {
      type: 'object',
      properties: {
        imagePath: { type: 'string', description: 'Path to the image to edit' },
        prompt: { type: 'string', description: 'Edit instruction' },
      },
      required: ['imagePath', 'prompt'],
    },
  },
  {
    name: 'forge_upscale_image',
    description: 'Upscale an image using RealESRGAN via RunPod.',
    inputSchema: {
      type: 'object',
      properties: {
        imagePath: { type: 'string', description: 'Path to the image to upscale' },
        scale: { type: 'number', enum: [2, 4], default: 4 },
      },
      required: ['imagePath'],
    },
  },
  {
    name: 'forge_list_media',
    description: 'List all generated media (images, videos, audio) in the gallery.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['image', 'video', 'audio'], description: 'Filter by media type' },
      },
    },
  },
  {
    name: 'forge_list_repos',
    description: 'List all managed repositories.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'forge_read_repo_file',
    description: 'Read a file from a managed repository.',
    inputSchema: {
      type: 'object',
      properties: {
        repoId: { type: 'string', description: 'ID of the repo' },
        path: { type: 'string', description: 'Path within the repo' },
      },
      required: ['repoId', 'path'],
    },
  },
  {
    name: 'forge_list_templates',
    description: 'List all available templates.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'forge_run_template',
    description: 'Execute a template with given parameters.',
    inputSchema: {
      type: 'object',
      properties: {
        templateId: { type: 'string', description: 'ID of the template to run' },
        params: { type: 'object', description: 'Template parameters' },
      },
      required: ['templateId'],
    },
  },
  {
    name: 'forge_create_template',
    description: 'Create a new template definition.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        type: { type: 'string', enum: ['remotion', 'demo-recording', 'image-preset', 'pipeline'] },
        description: { type: 'string' },
        params: { type: 'object' },
      },
      required: ['name', 'type', 'description'],
    },
  },
]

async function handleToolCall(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  // Log activity to Forge
  await forgeApi('/api/activity', 'POST', {
    tool: name,
    params: args,
    status: 'running',
    source: 'claude-code',
  })

  try {
    let result: unknown

    switch (name) {
      case 'forge_generate_image':
        result = await forgeApi('/api/generate/image', 'POST', {
          prompt: args.prompt,
          provider: args.provider || 'gemini',
          model: args.model,
        })
        break

      case 'forge_generate_video':
        result = await forgeApi('/api/generate/video', 'POST', {
          prompt: args.prompt,
          provider: args.provider || 'gemini',
        })
        break

      case 'forge_generate_audio':
        result = await forgeApi('/api/generate/audio', 'POST', {
          text: args.text,
          provider: args.provider || 'gemini',
          voiceName: args.voiceName,
        })
        break

      case 'forge_edit_image':
        result = { status: 'not_implemented', message: 'Qwen-Edit integration coming in Phase 4' }
        break

      case 'forge_upscale_image':
        result = { status: 'not_implemented', message: 'RealESRGAN integration coming in Phase 4' }
        break

      case 'forge_list_media': {
        const media = await forgeApi('/api/media') as unknown[]
        if (args.type) {
          result = (media as { type: string }[]).filter(m => m.type === args.type)
        } else {
          result = media
        }
        break
      }

      case 'forge_list_repos':
        result = await forgeApi('/api/repos')
        break

      case 'forge_read_repo_file':
        result = await forgeApi(`/api/repos/${args.repoId}/file?path=${encodeURIComponent(args.path as string)}`)
        break

      case 'forge_list_templates':
        result = await forgeApi('/api/templates')
        break

      case 'forge_run_template':
        result = { status: 'not_implemented', message: 'Template execution coming in Phase 8' }
        break

      case 'forge_create_template':
        result = await forgeApi('/api/templates', 'POST', {
          name: args.name,
          type: args.type,
          description: args.description,
          source: 'ai-generated',
          params: args.params || { schema: {}, values: {} },
          createdBy: 'ai',
        })
        break

      default:
        return { content: [{ type: 'text', text: `Unknown tool: ${name}` }] }
    }

    // Log completion
    await forgeApi('/api/activity', 'POST', {
      tool: name,
      params: args,
      status: 'done',
      result,
      source: 'claude-code',
    })

    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  } catch (err) {
    await forgeApi('/api/activity', 'POST', {
      tool: name,
      params: args,
      status: 'failed',
      result: String(err),
      source: 'claude-code',
    })
    return { content: [{ type: 'text', text: `Error: ${err}` }] }
  }
}

// --- Stdio MCP Protocol ---
let buffer = ''

process.stdin.setEncoding('utf-8')
process.stdin.on('data', (chunk: string) => {
  buffer += chunk
  processBuffer()
})

function processBuffer() {
  while (true) {
    const headerEnd = buffer.indexOf('\r\n\r\n')
    if (headerEnd === -1) return

    const header = buffer.slice(0, headerEnd)
    const contentLengthMatch = header.match(/Content-Length: (\d+)/)
    if (!contentLengthMatch) {
      buffer = buffer.slice(headerEnd + 4)
      continue
    }

    const contentLength = parseInt(contentLengthMatch[1], 10)
    const bodyStart = headerEnd + 4
    if (buffer.length < bodyStart + contentLength) return

    const body = buffer.slice(bodyStart, bodyStart + contentLength)
    buffer = buffer.slice(bodyStart + contentLength)

    try {
      const message = JSON.parse(body)
      handleMessage(message)
    } catch {
      // ignore parse errors
    }
  }
}

function send(message: unknown) {
  const body = JSON.stringify(message)
  const header = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n`
  process.stdout.write(header + body)
}

async function handleMessage(message: { id?: number; method: string; params?: unknown }) {
  switch (message.method) {
    case 'initialize':
      send({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'forge', version: '0.1.0' },
        },
      })
      break

    case 'notifications/initialized':
      // Client acknowledged initialization
      break

    case 'tools/list':
      send({
        jsonrpc: '2.0',
        id: message.id,
        result: { tools },
      })
      break

    case 'tools/call': {
      const params = message.params as { name: string; arguments: Record<string, unknown> }
      const result = await handleToolCall(params.name, params.arguments || {})
      send({
        jsonrpc: '2.0',
        id: message.id,
        result,
      })
      break
    }

    default:
      if (message.id !== undefined) {
        send({
          jsonrpc: '2.0',
          id: message.id,
          error: { code: -32601, message: `Method not found: ${message.method}` },
        })
      }
  }
}

// Keep process alive
process.stdin.resume()
