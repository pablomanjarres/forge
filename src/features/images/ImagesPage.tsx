import { useState } from 'react'
import { PageShell } from '@/components/shared/PageShell'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Sparkles, Loader2, Download } from 'lucide-react'

export function ImagesPage() {
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
      const res = await fetch('/api/generate/image', {
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

  const getImageUrl = (filePath: string) => {
    const filename = filePath.split('/').pop()
    return `/api/generated/${filename}`
  }

  return (
    <PageShell>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Images</h1>
        <p className="text-muted-foreground mt-1">Generate images with Gemini Imagen and Nano Banana.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Generation Form */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="font-semibold mb-4">Generate Image</h3>
          <div className="space-y-4">
            <div>
              <Label htmlFor="prompt">Prompt</Label>
              <textarea
                id="prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe the image you want to generate..."
                rows={4}
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Sparkles className="h-3 w-3" />
              <span>Provider: Gemini (gemini-2.0-flash-exp)</span>
            </div>

            <Button onClick={generate} disabled={generating || !prompt.trim()} className="w-full">
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate Image
                </>
              )}
            </Button>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>
        </div>

        {/* Preview */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="font-semibold mb-4">Preview</h3>
          {result ? (
            <div className="space-y-3">
              <img
                src={getImageUrl(result.filePath)}
                alt="Generated"
                className="w-full rounded-lg border border-border"
              />
              <div className="flex items-center gap-2">
                <a
                  href={getImageUrl(result.filePath)}
                  download
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  <Download className="h-3 w-3" />
                  Download
                </a>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-64 rounded-lg border border-dashed border-border">
              <p className="text-sm text-muted-foreground">Generated image will appear here</p>
            </div>
          )}
        </div>
      </div>
    </PageShell>
  )
}
