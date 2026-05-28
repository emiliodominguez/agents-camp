/**
 * Shared villager types and seed data. The runtime roster lives on the server
 * (file-backed) and is broadcast to clients over the WebSocket; this module
 * only describes the *shape* of a villager and the default starter set used
 * when no saved roster exists yet.
 */

/** Lifecycle state of a villager, surfaced as a status bubble. */
export type VillagerStatus = 'idle' | 'working' | 'talking'

/** A villager — the canonical record shared between server and client. */
export interface Villager {
  /** Stable id (slug from name on creation). */
  id: string
  /** Display name on the floor label and roster. */
  name: string
  /** Where the villager stands, in tile coordinates; their home sits just above. */
  tile: { column: number; row: number }
  /** Sprite key from the theme's `characters` (e.g. `citizen-2`). */
  sprite: string
  /** Roster dot colour (CSS hex). */
  dotColor: string
  /** Sprite key for the home placed above them (theme `agentStructures`). */
  structure: string
  /** Role persona used as the Claude system prompt. */
  persona: string
}

/** Shared base voice appended to every persona so replies stay in-world. */
export const sharedVoice =
  'You are a villager in a small medieval camp of AI coding agents. ' +
  'Speak in first person, stay in character, and keep replies to one or two short sentences ' +
  'unless asked for detail. You are conversational only — you cannot run tools or touch files.'

/**
 * The starter villagers seeded into the roster on first run. After that, the
 * server's `.agents/villagers.json` is the source of truth.
 *
 * @returns Fresh seed villagers.
 */
export function defaultSeed(): Villager[] {
  return [
    {
      id: 'planner',
      name: 'Planner',
      tile: { column: 5, row: 6 },
      sprite: 'citizen-1',
      dotColor: '#7c9cff',
      structure: 'house-1',
      persona: `You are the Planner. You break work into clear steps and think before acting. ${sharedVoice}`
    },
    {
      id: 'builder',
      name: 'Builder',
      tile: { column: 12, row: 5 },
      sprite: 'citizen-2',
      dotColor: '#6bd6a4',
      structure: 'tent-1',
      persona: `You are the Builder. You are practical and eager to implement things. ${sharedVoice}`
    },
    {
      id: 'reviewer',
      name: 'Reviewer',
      tile: { column: 20, row: 6 },
      sprite: 'citizen-3',
      dotColor: '#f0a868',
      structure: 'house-2',
      persona: `You are the Reviewer. You are careful, a little skeptical, and look for problems. ${sharedVoice}`
    },
    {
      id: 'explorer',
      name: 'Explorer',
      tile: { column: 21, row: 14 },
      sprite: 'citizen-4',
      dotColor: '#d58cf0',
      structure: 'tent-2',
      persona: `You are the Explorer. You are curious and like to investigate and ask questions. ${sharedVoice}`
    }
  ]
}
