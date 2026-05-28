import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { SkillSummary } from '../shared/protocol'

/**
 * Enumerate the skills available to the villagers (their Skill tool calls).
 * Reads `~/.claude/skills` (user) and `<repo>/.claude/skills` (project), each
 * folder being one skill; the SKILL.md or first markdown file's frontmatter
 * gives the description.
 */

const here = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(here, '..')
const userSkillsDir = join(homedir(), '.claude', 'skills')
const projectSkillsDir = join(projectRoot, '.claude', 'skills')

/**
 * Extract a one-line description from a skill markdown file's frontmatter
 * (looks for a `description:` field) or the first non-empty heading/line.
 *
 * @param markdown - The skill's markdown text.
 * @returns A short description.
 */
function extractDescription(markdown: string): string {
  const frontmatterMatch = markdown.match(/^---\n([\s\S]*?)\n---/)

  if (frontmatterMatch?.[1] !== undefined) {
    const descLine = frontmatterMatch[1].split('\n').find((line) => line.trim().startsWith('description:'))

    if (descLine !== undefined) {
      return descLine.replace(/^description:\s*/, '').replace(/^["']|["']$/g, '').trim().slice(0, 200)
    }
  }

  const firstLine = markdown
    .replace(/^---\n[\s\S]*?\n---\n?/, '')
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line !== '' && !line.startsWith('#'))

  return firstLine?.slice(0, 200) ?? ''
}

/**
 * Read every skill in a directory, returning summaries. A skill is a folder
 * containing at least one markdown file.
 *
 * @param dir - The skills directory.
 * @param source - Where these skills come from (for display).
 * @returns The summaries.
 */
function readSkills(dir: string, source: 'user' | 'project'): SkillSummary[] {
  if (!existsSync(dir)) {
    return []
  }

  const entries = readdirSync(dir)
  const skills: SkillSummary[] = []

  for (const entry of entries) {
    const skillDir = join(dir, entry)

    try {
      if (!statSync(skillDir).isDirectory()) {
        continue
      }
    } catch {
      continue
    }

    const skillMd = join(skillDir, 'SKILL.md')
    const file = existsSync(skillMd)
      ? skillMd
      : readdirSync(skillDir).find((name) => name.toLowerCase().endsWith('.md'))

    if (file === undefined) {
      continue
    }

    const fullPath = file.startsWith('/') ? file : join(skillDir, file)

    try {
      const description = extractDescription(readFileSync(fullPath, 'utf8'))
      skills.push({ name: entry, source, description })
    } catch {
      // Unreadable skill — skip.
    }
  }

  return skills.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * List every skill available across user and project sources.
 *
 * @returns Skill summaries, sorted by name within each source.
 */
export async function listSkills(): Promise<SkillSummary[]> {
  return [...readSkills(projectSkillsDir, 'project'), ...readSkills(userSkillsDir, 'user')]
}
