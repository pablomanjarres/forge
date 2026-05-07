import fs from 'fs'
import path from 'path'

export const MEDIA_ROOT = path.join(process.env.HOME || '', 'Projects', 'media')

const MEDIA_EXTENSIONS: Record<string, string> = {
  '.mp4': 'video', '.mov': 'video', '.mkv': 'video', '.avi': 'video', '.webm': 'video',
  '.png': 'image', '.jpg': 'image', '.jpeg': 'image', '.gif': 'image', '.webp': 'image', '.svg': 'image',
  '.mp3': 'audio', '.wav': 'audio', '.aac': 'audio', '.flac': 'audio', '.m4a': 'audio',
  '.prproj': 'premiere', '.md': 'text', '.json': 'data',
}

export interface DirEntry {
  name: string
  type: 'directory' | 'file'
  path: string
  size?: number
  mtime?: string
  mediaType?: string
}

export function listDir(relativePath: string): DirEntry[] {
  const fullPath = path.join(MEDIA_ROOT, relativePath || '')
  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isDirectory()) return []

  return fs.readdirSync(fullPath, { withFileTypes: true })
    .filter(e => !e.name.startsWith('.'))
    .map(e => {
      const entryPath = path.join(relativePath || '', e.name)
      const stat = fs.statSync(path.join(fullPath, e.name))
      const ext = path.extname(e.name).toLowerCase()
      return {
        name: e.name,
        type: e.isDirectory() ? 'directory' as const : 'file' as const,
        path: entryPath,
        size: e.isFile() ? stat.size : undefined,
        mtime: stat.mtime.toISOString(),
        mediaType: e.isFile() ? MEDIA_EXTENSIONS[ext] || 'other' : undefined,
      }
    })
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
}

export interface ProjectMeta {
  title?: string
  type?: string
  slug?: string
  weekKey?: string
  createdAt?: string
  [key: string]: unknown
}

export interface Project {
  slug: string
  weekKey: string
  path: string
  meta: ProjectMeta
  sourceCount: number
  exportCount: number
}

export function getWeeks(): string[] {
  const videosDir = path.join(MEDIA_ROOT, 'videos')
  if (!fs.existsSync(videosDir)) return []
  return fs.readdirSync(videosDir, { withFileTypes: true })
    .filter(e => e.isDirectory() && /^\d{4}-W\d{2}$/.test(e.name))
    .map(e => e.name)
    .sort()
    .reverse()
}

export function getProjects(weekKey?: string): Project[] {
  const weeks = weekKey ? [weekKey] : getWeeks()
  const projects: Project[] = []

  for (const week of weeks) {
    const contentDir = path.join(MEDIA_ROOT, 'videos', week, 'content')
    if (!fs.existsSync(contentDir)) continue

    for (const entry of fs.readdirSync(contentDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const projectPath = path.join('videos', week, 'content', entry.name)
      const metaFile = path.join(MEDIA_ROOT, projectPath, 'project.json')
      let meta: ProjectMeta = {}
      if (fs.existsSync(metaFile)) {
        try { meta = JSON.parse(fs.readFileSync(metaFile, 'utf-8')) } catch {}
      }

      const sourcesDir = path.join(MEDIA_ROOT, projectPath, 'sources')
      const exportsDir = path.join(MEDIA_ROOT, projectPath, 'exports')
      const sourceCount = fs.existsSync(sourcesDir)
        ? fs.readdirSync(sourcesDir).filter(f => !f.startsWith('.')).length : 0
      const exportCount = fs.existsSync(exportsDir)
        ? fs.readdirSync(exportsDir).filter(f => !f.startsWith('.')).length : 0

      projects.push({
        slug: entry.name,
        weekKey: week,
        path: projectPath,
        meta,
        sourceCount,
        exportCount,
      })
    }
  }

  return projects.sort((a, b) => (b.meta.createdAt || '').localeCompare(a.meta.createdAt || ''))
}

function currentWeekKey(): string {
  const now = new Date()
  const jan1 = new Date(now.getFullYear(), 0, 1)
  const days = Math.floor((now.getTime() - jan1.getTime()) / 86400000)
  const week = Math.ceil((days + jan1.getDay() + 1) / 7)
  return `${now.getFullYear()}-W${String(week).padStart(2, '0')}`
}

export function createProject(opts: { week?: string; slug: string; title: string; type?: string }): Project {
  const weekKey = opts.week || currentWeekKey()
  const projectPath = path.join('videos', weekKey, 'content', opts.slug)
  const fullPath = path.join(MEDIA_ROOT, projectPath)

  // Create directory structure
  fs.mkdirSync(path.join(fullPath, 'sources'), { recursive: true })
  fs.mkdirSync(path.join(fullPath, 'exports'), { recursive: true })

  // Write project.json
  const meta: ProjectMeta = {
    title: opts.title,
    type: opts.type || 'short-form',
    slug: opts.slug,
    weekKey,
    createdAt: new Date().toISOString(),
  }
  fs.writeFileSync(path.join(fullPath, 'project.json'), JSON.stringify(meta, null, 2))

  // Write script.md template
  fs.writeFileSync(path.join(fullPath, 'script.md'), `# ${opts.title}\n\n## Hook\n\n## Script\n\n## CTA\n`)

  return { slug: opts.slug, weekKey, path: projectPath, meta, sourceCount: 0, exportCount: 0 }
}

export function moveFile(from: string, to: string): boolean {
  const srcPath = path.join(MEDIA_ROOT, from)
  const destPath = path.join(MEDIA_ROOT, to)
  if (!fs.existsSync(srcPath)) return false
  const destDir = path.dirname(destPath)
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true })
  fs.renameSync(srcPath, destPath)
  return true
}
