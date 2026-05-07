import { useState } from 'react'
import { PageShell } from '@/components/shared/PageShell'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Video, Loader2 } from 'lucide-react'

export function VideosPage() {
  const [prompt, setPrompt] = useState('')
  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState<{ filePath: string; id: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const generate = async () => {
    if (!prompt.trim()) return
    setGenerating(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch('/api/generate/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, provider: 'gemini' }),
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

  const getVideoUrl = (filePath: string) => {
    const filename = filePath.split('/').pop()
    return `/api/generated/${filename}`
  }

  return (
    <PageShell>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Videos</h1>
        <p className="text-muted-foreground mt-1">Generate videos with Gemini Veo and Remotion templates.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="font-semibold mb-4">Generate Video</h3>
          <div className="space-y-4">
            <div>
              <Label htmlFor="vprompt">Prompt</Label>
              <textarea
                id="vprompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe the video scene you want to generate..."
                rows={4}
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
            </div>
            <div className="text-xs text-muted-foreground">
              <p>Provider: Gemini Veo 2 (720p, 8 seconds)</p>
              <p className="mt-1">Note: Video generation takes 1-3 minutes.</p>
            </div>
            <Button onClick={generate} disabled={generating || !prompt.trim()} className="w-full">
              {generating ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating...</>
              ) : (
                <><Video className="h-4 w-4 mr-2" />Generate Video</>
              )}
            </Button>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="font-semibold mb-4">Preview</h3>
          {result ? (
            <video src={getVideoUrl(result.filePath)} controls className="w-full rounded-lg border border-border" />
          ) : (
            <div className="flex items-center justify-center h-64 rounded-lg border border-dashed border-border">
              <p className="text-sm text-muted-foreground">Generated video will appear here</p>
            </div>
          )}
        </div>
      </div>
    </PageShell>
  )
}
