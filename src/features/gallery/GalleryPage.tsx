import { useState, useEffect } from 'react'
import { PageShell } from '@/components/shared/PageShell'
import { Button } from '@/components/ui/button'
import { Image, Video, AudioLines, Trash2, Download, Calendar, Sparkles } from 'lucide-react'

interface MediaItem {
  id: string
  type: 'image' | 'video' | 'audio'
  provider: string
  model?: string
  prompt: string
  filePath: string
  width?: number
  height?: number
  duration?: number
  createdAt: string
}

const TYPE_ICONS: Record<string, typeof Image> = {
  image: Image,
  video: Video,
  audio: AudioLines,
}

export function GalleryPage() {
  const [media, setMedia] = useState<MediaItem[]>([])
  const [filter, setFilter] = useState<'all' | 'image' | 'video' | 'audio'>('all')
  const [preview, setPreview] = useState<MediaItem | null>(null)

  useEffect(() => {
    fetch('/api/media').then(r => r.json()).then(setMedia).catch(() => {})

    // Real-time updates
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${location.host}/ws`)
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      if (msg.type === 'media_created') {
        setMedia(prev => [msg.data, ...prev])
      }
    }
    return () => ws.close()
  }, [])

  const filtered = filter === 'all' ? media : media.filter(m => m.type === filter)

  const getMediaUrl = (filePath: string) => {
    const filename = filePath.split('/').pop()
    return `/api/generated/${filename}`
  }

  const deleteItem = async (id: string) => {
    await fetch(`/api/media/${id}`, { method: 'DELETE' })
    setMedia(prev => prev.filter(m => m.id !== id))
    if (preview?.id === id) setPreview(null)
  }

  return (
    <PageShell>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Gallery</h1>
          <p className="text-muted-foreground mt-1">Browse all generated media.</p>
        </div>
        <p className="text-sm text-muted-foreground">{media.length} items</p>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {(['all', 'image', 'video', 'audio'] as const).map(type => (
          <button
            key={type}
            onClick={() => setFilter(type)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === type ? 'bg-foreground text-background' : 'bg-secondary text-muted-foreground hover:text-foreground'
            }`}
          >
            {type !== 'all' && (() => { const Icon = TYPE_ICONS[type]; return <Icon className="h-3 w-3" /> })()}
            {type === 'all' ? `All (${media.length})` : `${type} (${media.filter(m => m.type === type).length})`}
          </button>
        ))}
      </div>

      {/* Preview Modal */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setPreview(null)}>
          <div className="max-w-3xl max-h-[80vh] w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="p-4">
                {preview.type === 'image' && (
                  <img src={getMediaUrl(preview.filePath)} alt={preview.prompt} className="w-full rounded-lg" />
                )}
                {preview.type === 'video' && (
                  <video src={getMediaUrl(preview.filePath)} controls className="w-full rounded-lg" />
                )}
                {preview.type === 'audio' && (
                  <audio src={getMediaUrl(preview.filePath)} controls className="w-full" />
                )}
              </div>
              <div className="px-4 pb-4 space-y-2">
                <p className="text-sm">{preview.prompt}</p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Sparkles className="h-3 w-3" />{preview.provider}</span>
                  {preview.model && <span>{preview.model}</span>}
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {new Date(preview.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex gap-2 pt-2">
                  <a href={getMediaUrl(preview.filePath)} download className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                    <Download className="h-3 w-3" />Download
                  </a>
                  <Button variant="ghost" size="sm" onClick={() => { deleteItem(preview.id); setPreview(null) }}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Media Grid */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map(item => {
          const Icon = TYPE_ICONS[item.type] || Image
          return (
            <div
              key={item.id}
              className="rounded-xl border border-border bg-card overflow-hidden hover:border-muted-foreground/30 transition-colors cursor-pointer group"
              onClick={() => setPreview(item)}
            >
              {item.type === 'image' ? (
                <div className="aspect-square bg-secondary">
                  <img src={getMediaUrl(item.filePath)} alt={item.prompt} className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="aspect-square bg-secondary flex items-center justify-center">
                  <Icon className="h-8 w-8 text-muted-foreground" />
                </div>
              )}
              <div className="p-3">
                <p className="text-xs truncate">{item.prompt}</p>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs text-muted-foreground">{item.provider}</span>
                  <span className="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
          )
        })}
        {filtered.length === 0 && (
          <div className="col-span-full rounded-xl border border-border bg-card p-8 text-center">
            <Image className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-muted-foreground">No media yet. Generate some from the Images, Videos, or Audio pages.</p>
          </div>
        )}
      </div>
    </PageShell>
  )
}
