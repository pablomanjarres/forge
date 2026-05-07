// RunPod serverless GPU endpoint integration
// Supports: Qwen-Edit (image editing), RealESRGAN (upscaling), Qwen3-TTS

import fs from 'fs'
import path from 'path'
import { DATA_DIR } from '../storage.js'

export interface RunPodConfig {
  apiKey: string
  endpoints: {
    'qwen-edit'?: string
    'realesrgan'?: string
    'qwen3-tts'?: string
    'sadtalker'?: string
    'propainter'?: string
  }
}

const GENERATED_DIR = () => {
  const dir = path.join(DATA_DIR, 'generated')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

export async function checkHealth(apiKey: string): Promise<boolean> {
  if (!apiKey) return false
  try {
    const res = await fetch('https://api.runpod.ai/v2/pods', {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    return res.ok || res.status === 401 // 401 means key works but no pods
  } catch {
    return false
  }
}

async function runpodRequest(
  apiKey: string,
  endpointId: string,
  input: Record<string, unknown>
): Promise<unknown> {
  // Start the job
  const runRes = await fetch(`https://api.runpod.ai/v2/${endpointId}/runsync`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ input }),
  })

  if (!runRes.ok) {
    const errText = await runRes.text()
    throw new Error(`RunPod error: ${runRes.status} ${errText}`)
  }

  const result = await runRes.json()

  if (result.status === 'COMPLETED') {
    return result.output
  }

  // If not completed synchronously, poll
  if (result.id) {
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 5000))
      const statusRes = await fetch(`https://api.runpod.ai/v2/${endpointId}/status/${result.id}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
      const status = await statusRes.json()
      if (status.status === 'COMPLETED') return status.output
      if (status.status === 'FAILED') throw new Error(`RunPod job failed: ${JSON.stringify(status)}`)
    }
    throw new Error('RunPod job timed out')
  }

  return result
}

export async function editImage(
  apiKey: string,
  endpointId: string,
  imagePath: string,
  prompt: string
): Promise<{ filePath: string }> {
  const imageBuffer = fs.readFileSync(imagePath)
  const imageBase64 = imageBuffer.toString('base64')

  const output = await runpodRequest(apiKey, endpointId, {
    image: imageBase64,
    prompt,
  }) as { image?: string }

  if (!output?.image) throw new Error('No image returned from Qwen-Edit')

  const filename = `edit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`
  const filePath = path.join(GENERATED_DIR(), filename)
  fs.writeFileSync(filePath, Buffer.from(output.image, 'base64'))

  return { filePath }
}

export async function upscaleImage(
  apiKey: string,
  endpointId: string,
  imagePath: string,
  scale: number = 4
): Promise<{ filePath: string }> {
  const imageBuffer = fs.readFileSync(imagePath)
  const imageBase64 = imageBuffer.toString('base64')

  const output = await runpodRequest(apiKey, endpointId, {
    image: imageBase64,
    scale,
  }) as { image?: string }

  if (!output?.image) throw new Error('No image returned from RealESRGAN')

  const filename = `upscale-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`
  const filePath = path.join(GENERATED_DIR(), filename)
  fs.writeFileSync(filePath, Buffer.from(output.image, 'base64'))

  return { filePath }
}

export async function generateTTS(
  apiKey: string,
  endpointId: string,
  text: string,
  speaker: string = 'default'
): Promise<{ filePath: string; duration: number }> {
  const output = await runpodRequest(apiKey, endpointId, {
    text,
    speaker,
  }) as { audio?: string; duration?: number }

  if (!output?.audio) throw new Error('No audio returned from Qwen3-TTS')

  const filename = `tts-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.wav`
  const filePath = path.join(GENERATED_DIR(), filename)
  fs.writeFileSync(filePath, Buffer.from(output.audio, 'base64'))

  return { filePath, duration: output.duration || 0 }
}
