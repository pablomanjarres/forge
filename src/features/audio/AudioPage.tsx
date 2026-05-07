import { useState } from 'react'
import { PageShell } from '@/components/shared/PageShell'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { AudioLines, Loader2 } from 'lucide-react'

const VOICES = ['Kore', 'Charon', 'Fenrir', 'Aoede', 'Puck', 'Leda']

export function AudioPage() {
  const [text, setText] = useState('')
  const [voice, setVoice] = useState('Kore')
  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState<{ filePath: string; id: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const generate = async () => {
    if (!text.trim()) return
    setGenerating(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch('/api/generate/audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, provider: 'gemini', voiceName: voice }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setResult(data)
    } catch (err) {
      setError(String(err))
    } finally {
      setGenerating(false)
    }
  }

  const getAudioUrl = (filePath: string) => {
    const filename = filePath.split('/').pop()
    return `/api/generated/${filename}`
  }

  return (
    <PageShell>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audio</h1>
        <p className="text-muted-foreground mt-1">Generate speech with Gemini TTS, ElevenLabs, and Qwen3-TTS.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="font-semibold mb-4">Text to Speech</h3>
          <div className="space-y-4">
            <div>
              <Label htmlFor="tts-text">Text</Label>
              <textarea
                id="tts-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Enter the text you want to convert to speech..."
                rows={6}
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
            </div>
            <div>
              <Label>Voice</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {VOICES.map(v => (
                  <button
                    key={v}
                    onClick={() => setVoice(v)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      voice === v
                        ? 'bg-foreground text-background'
                        : 'bg-secondary text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <Button onClick={generate} disabled={generating || !text.trim()} className="w-full">
              {generating ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating...</>
              ) : (
                <><AudioLines className="h-4 w-4 mr-2" />Generate Speech</>
              )}
            </Button>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="font-semibold mb-4">Preview</h3>
          {result ? (
            <audio src={getAudioUrl(result.filePath)} controls className="w-full" />
          ) : (
            <div className="flex items-center justify-center h-32 rounded-lg border border-dashed border-border">
              <p className="text-sm text-muted-foreground">Generated audio will appear here</p>
            </div>
          )}
        </div>
      </div>
    </PageShell>
  )
}
