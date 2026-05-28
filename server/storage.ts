import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, rmSync, unlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { defaultSeed, type Villager } from '../shared/agents'
import type { ChatLine } from '../shared/protocol'

/**
 * On-disk source of truth for the camp's roster and chat transcripts.
 *
 * Files live under `.agents/` at the repo root:
 *   .agents/villagers.json        — the full roster
 *   .agents/chats/<id>.json       — one transcript per villager
 *
 * Reads are synchronous (small files); writes are too — at this scale a single
 * `writeFileSync` after each mutation is plenty.
 */

const here = dirname(fileURLToPath(import.meta.url))
const dataDir = join(here, '..', '.agents')
const chatsDir = join(dataDir, 'chats')
const workspacesDir = join(dataDir, 'workspace')
const rosterPath = join(dataDir, 'villagers.json')

mkdirSync(chatsDir, { recursive: true })
mkdirSync(workspacesDir, { recursive: true })

/**
 * Ensure a per-villager workspace directory exists and return its path. This is
 * the `cwd` the Agent SDK runs each villager's tool calls in.
 *
 * @param agentId - The villager whose workspace to ensure.
 * @returns The absolute workspace path.
 */
export function ensureWorkspace(agentId: string): string {
  const path = join(workspacesDir, agentId)
  mkdirSync(path, { recursive: true })

  return path
}

/**
 * Remove a villager's workspace directory recursively.
 *
 * @param agentId - The villager whose workspace to remove.
 */
export function deleteWorkspace(agentId: string): void {
  const path = join(workspacesDir, agentId)

  if (existsSync(path)) {
    try {
      rmSync(path, { recursive: true, force: true })
    } catch {
      // Best effort; if a file is locked we leave it.
    }
  }
}

/**
 * Load the roster from disk, seeding the file with the default villagers on
 * first run.
 *
 * @returns The current villagers.
 */
export function loadRoster(): Villager[] {
  if (!existsSync(rosterPath)) {
    const seed = defaultSeed()
    saveRoster(seed)

    return seed
  }

  try {
    const raw = readFileSync(rosterPath, 'utf8')
    const parsed = JSON.parse(raw) as Villager[]

    return Array.isArray(parsed) ? parsed : defaultSeed()
  } catch {
    return defaultSeed()
  }
}

/**
 * Replace the roster on disk.
 *
 * @param villagers - The villagers to persist.
 */
export function saveRoster(villagers: Villager[]): void {
  writeFileSync(rosterPath, JSON.stringify(villagers, null, 2), 'utf8')
}

/** Path to a villager's chat transcript file. */
function transcriptPath(agentId: string): string {
  return join(chatsDir, `${agentId}.json`)
}

/**
 * Load the saved transcript for a villager.
 *
 * @param agentId - The villager.
 * @returns The saved lines (oldest first), or an empty array.
 */
export function loadTranscript(agentId: string): ChatLine[] {
  const path = transcriptPath(agentId)

  if (!existsSync(path)) {
    return []
  }

  try {
    const raw = readFileSync(path, 'utf8')
    const parsed = JSON.parse(raw) as ChatLine[]

    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * Append a line to a villager's transcript.
 *
 * @param agentId - The villager.
 * @param line - The line to append.
 */
export function appendTranscriptLine(agentId: string, line: ChatLine): void {
  const lines = loadTranscript(agentId)
  lines.push(line)
  writeFileSync(transcriptPath(agentId), JSON.stringify(lines, null, 2), 'utf8')
}

/**
 * Delete a villager's transcript file (used when a spawned villager is removed).
 *
 * @param agentId - The villager.
 */
export function deleteTranscript(agentId: string): void {
  const path = transcriptPath(agentId)

  if (existsSync(path)) {
    unlinkSync(path)
  }
}

/** Sanity check during boot. */
export function describeStorage(): string {
  const chatCount = readdirSync(chatsDir).filter((file) => file.endsWith('.json')).length

  return `roster=${rosterPath}, chats=${chatsDir} (${chatCount} transcripts)`
}
