// ElevenLabs voice generation integration

import fs from 'fs'
import path from 'path'
import { DATA_DIR } from '../storage.js'

export interface ElevenLabsConfig {
  apiKey: string
  defaultVoiceId?: string
}

const GENERATED_DIR = () => {
  const dir = path.join(DATA_DIR, 'generated')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

export async function checkHealth(apiKey: string): Promise<boolean> {
  if (!apiKey) return false
  try {
    const res = await fetch('https://api.elevenlabs.io/v1/user', {
      headers: { 'xi-api-key': apiKey },
    })
    return res.ok
  } catch {
    return false
  }
}

export async function listVoices(apiKey: string): Promise<{ voice_id: string; name: string }[]> {
  const res = await fetch('https://api.elevenlabs.io/v1/voices', {
    headers: { 'xi-api-key': apiKey },
  })
  if (!res.ok) throw new Error(`ElevenLabs error: ${res.status}`)
  const data = await res.json()
  return data.voices?.map((v: { voice_id: string; name: string }) => ({
    voice_id: v.voice_id,
    name: v.name,
  })) || []
}

export async function generateSpeech(
  apiKey: string,
  text: string,
  voiceId: string = 'EXAVITQu4vr4xnSDxMaL', // Default: Sarah
  options: {
    modelId?: string
    stability?: number
    similarityBoost?: number
  } = {}
): Promise<{ filePath: string; duration: number }> {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      model_id: options.modelId || 'eleven_multilingual_v2',
      voice_settings: {
        stability: options.stability ?? 0.5,
        similarity_boost: options.similarityBoost ?? 0.75,
      },
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`ElevenLabs error: ${res.status} ${errText}`)
  }

  const buffer = Buffer.from(await res.arrayBuffer())
  const filename = `elevenlabs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp3`
  const filePath = path.join(GENERATED_DIR(), filename)
  fs.writeFileSync(filePath, buffer)

  return { filePath, duration: 0 }
}

export async function generateSoundEffect(
  apiKey: string,
  text: string,
  durationSeconds?: number
): Promise<{ filePath: string; duration: number }> {
  const res = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      duration_seconds: durationSeconds,
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`ElevenLabs error: ${res.status} ${errText}`)
  }

  const buffer = Buffer.from(await res.arrayBuffer())
  const filename = `sfx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp3`
  const filePath = path.join(GENERATED_DIR(), filename)
  fs.writeFileSync(filePath, buffer)

  return { filePath, duration: durationSeconds || 0 }
}
