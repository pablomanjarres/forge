import fs from 'fs'
import path from 'path'
import os from 'os'

// Skills live in three known roots. We expose their names + descriptions so
// Gemini can be told which are relevant, and load raw SKILL.md content on
// demand for system-prompt context.
export interface SkillInfo {
  name: string
  description: string
  path: string
  source: 'claude-user' | 'stitch' | 'projects'
  skillMdPath: string
}

const HOME = os.homedir()
const SKILL_ROOTS: { dir: string; source: SkillInfo['source'] }[] = [
  { dir: path.join(HOME, '.claude', 'skills'), source: 'claude-user' },
  { dir: path.join(HOME, 'Projects', 'stitch-skills', 'skills'), source: 'stitch' },
  { dir: path.join(HOME, 'Projects', 'skills', 'skills'), source: 'projects' },
]

function parseFrontmatter(md: string): { name?: string; description?: string } {
  const match = md.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return {}
  const out: Record<string, string> = {}
  for (const line of match[1].split('\n')) {
    const m = line.match(/^([a-zA-Z_-]+):\s*(.*)$/)
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
  }
  return { name: out.name, description: out.description }
}

export function listSkills(): SkillInfo[] {
  const skills: SkillInfo[] = []
  for (const { dir, source } of SKILL_ROOTS) {
    if (!fs.existsSync(dir)) continue
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const skillMdPath = path.join(dir, entry.name, 'SKILL.md')
      if (!fs.existsSync(skillMdPath)) continue
      try {
        const md = fs.readFileSync(skillMdPath, 'utf-8')
        const fm = parseFrontmatter(md)
        skills.push({
          name: fm.name || entry.name,
          description: fm.description || '',
          path: path.join(dir, entry.name),
          source,
          skillMdPath,
        })
      } catch {
        // ignore malformed skills
      }
    }
  }
  return skills
}

export function getSkillContent(name: string): string | null {
  const skill = listSkills().find((s) => s.name === name)
  if (!skill) return null
  try {
    return fs.readFileSync(skill.skillMdPath, 'utf-8')
  } catch {
    return null
  }
}
