import { GoogleGenAI } from '@google/genai'
import fs from 'fs'
import path from 'path'
import { DATA_DIR } from '../storage.js'

export interface GeminiConfig {
  apiKey: string
  defaultModel?: string
}

const GENERATED_DIR = () => {
  const dir = path.join(DATA_DIR, 'generated')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

export async function checkHealth(apiKey: string): Promise<boolean> {
  if (!apiKey) return false
  try {
    const ai = new GoogleGenAI({ apiKey })
    const result = await ai.models.list()
    return true
  } catch {
    return false
  }
}

export async function generateImage(
  apiKey: string,
  prompt: string,
  options: { model?: string; width?: number; height?: number } = {}
): Promise<{ filePath: string; width: number; height: number }> {
  const ai = new GoogleGenAI({ apiKey })
  const model = options.model || 'gemini-2.0-flash-exp'

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseModalities: ['image', 'text'],
    },
  })

  // Extract image from response
  const parts = response.candidates?.[0]?.content?.parts || []
  for (const part of parts) {
    if (part.inlineData?.mimeType?.startsWith('image/')) {
      const ext = part.inlineData.mimeType.split('/')[1] || 'png'
      const filename = `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      const filePath = path.join(GENERATED_DIR(), filename)
      const buffer = Buffer.from(part.inlineData.data!, 'base64')
      fs.writeFileSync(filePath, buffer)
      return { filePath, width: options.width || 1024, height: options.height || 1024 }
    }
  }

  throw new Error('No image generated in response')
}

export async function generateVideo(
  apiKey: string,
  prompt: string,
  options: { model?: string; imageBase64?: string } = {}
): Promise<{ filePath: string; duration: number }> {
  const ai = new GoogleGenAI({ apiKey })

  // Use Veo for video generation
  const operation = await ai.models.generateVideos({
    model: options.model || 'veo-2.0-generate-001',
    prompt,
    config: {
      numberOfVideos: 1,
      durationSeconds: 8,
      resolution: '720p',
    },
  })

  // Poll for completion
  let result = operation
  while (!result.done) {
    await new Promise(r => setTimeout(r, 5000))
    result = await ai.operations.get({ operation: result })
  }

  // Download the video
  const video = result.response?.generatedVideos?.[0]
  if (!video?.video?.uri) throw new Error('No video generated')

  const videoResponse = await fetch(video.video.uri)
  const buffer = Buffer.from(await videoResponse.arrayBuffer())
  const filename = `vid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`
  const filePath = path.join(GENERATED_DIR(), filename)
  fs.writeFileSync(filePath, buffer)

  return { filePath, duration: 8 }
}

export async function generateSpeech(
  apiKey: string,
  text: string,
  options: { model?: string; voiceName?: string } = {}
): Promise<{ filePath: string; duration: number }> {
  const ai = new GoogleGenAI({ apiKey })
  const model = options.model || 'gemini-2.5-flash-preview-tts'

  const response = await ai.models.generateContent({
    model,
    contents: text,
    config: {
      responseModalities: ['audio'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: options.voiceName || 'Kore',
          },
        },
      },
    },
  })

  const parts = response.candidates?.[0]?.content?.parts || []
  for (const part of parts) {
    if (part.inlineData?.mimeType?.startsWith('audio/')) {
      const filename = `audio-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.wav`
      const filePath = path.join(GENERATED_DIR(), filename)
      const buffer = Buffer.from(part.inlineData.data!, 'base64')
      fs.writeFileSync(filePath, buffer)
      return { filePath, duration: 0 }
    }
  }

  throw new Error('No audio generated in response')
}

export async function chat(
  apiKey: string,
  prompt: string,
  options: { model?: string; systemInstruction?: string } = {}
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey })
  const model = options.model || 'gemini-2.5-pro'

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      systemInstruction: options.systemInstruction,
    },
  })

  return response.text || ''
}
