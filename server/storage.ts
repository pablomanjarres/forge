import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function getDataDir(): string {
  if (process.env.NODE_ENV === 'production') {
    const iCloudDir = path.join(
      process.env.HOME || '',
      'Library', 'Mobile Documents', 'com~apple~CloudDocs', 'Forge'
    )
    if (!fs.existsSync(iCloudDir)) {
      fs.mkdirSync(iCloudDir, { recursive: true })
    }
    return iCloudDir
  }
  const dir = process.env.FORGE_DATA_DIR || path.join(__dirname, '..', 'data')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

export const DATA_DIR = getDataDir()

export function read<T>(file: string): T[] {
  const filepath = path.join(DATA_DIR, `${file}.json`)
  if (!fs.existsSync(filepath)) {
    fs.writeFileSync(filepath, '[]')
    return []
  }
  return JSON.parse(fs.readFileSync(filepath, 'utf-8'))
}

export function readObj<T>(file: string, fallback: T): T {
  const filepath = path.join(DATA_DIR, `${file}.json`)
  if (!fs.existsSync(filepath)) {
    fs.writeFileSync(filepath, JSON.stringify(fallback, null, 2))
    return fallback
  }
  return JSON.parse(fs.readFileSync(filepath, 'utf-8'))
}

export function write<T>(file: string, data: T): void {
  const filepath = path.join(DATA_DIR, `${file}.json`)
  const tmpPath = filepath + '.tmp'
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2))
  fs.renameSync(tmpPath, filepath)
}

export function findById<T extends { id: string }>(file: string, id: string): T | undefined {
  return read<T>(file).find(item => item.id === id)
}

export function upsert<T extends { id: string }>(file: string, item: T): T {
  const items = read<T>(file)
  const idx = items.findIndex(i => i.id === item.id)
  if (idx >= 0) {
    items[idx] = item
  } else {
    items.push(item)
  }
  write(file, items)
  return item
}

export function remove(file: string, id: string): boolean {
  const items = read<{ id: string }>(file)
  const filtered = items.filter(i => i.id !== id)
  if (filtered.length === items.length) return false
  write(file, filtered)
  return true
}
