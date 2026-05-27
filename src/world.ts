/**
 * Static description of the scene: its grid dimensions, tile size, and the
 * agents that occupy it. For this first pass the agents are hard-coded so we
 * can see the scene before any Claude wiring exists. Later the backend will
 * supply this list (and live status) over a WebSocket.
 */

/** Lifecycle state of an agent, surfaced as a status bubble above its sprite. */
export type AgentStatus = 'idle' | 'working' | 'talking'

/** A single character in the scene. */
export interface AgentDescriptor {
  /** Stable identifier used to address the agent's session later. */
  id: string
  /** Display name shown on the floor label. */
  name: string
  /** Where the agent stands, in tile coordinates. Their home sits just above. */
  tile: { column: number; row: number }
  /** Colour of the agent's dot in the roster overlay (CSS hex). */
  dotColor: string
  /** Current lifecycle state. */
  status: AgentStatus
}

/** Rendered edge length of one tile, in pixels (matches the 32px source art). */
export const tileSize = 32

/**
 * Scene size, measured in tiles. The world is larger than the viewport — the
 * camera follows the player and the edges scroll off-screen, so the camp feels
 * like a place you explore rather than a single tableau.
 */
export const officeColumns = 26
export const officeRows = 20

/** The avatar the player drives around the scene. */
export const playerSpawn = { column: 12, row: 13 }

/**
 * The agents currently in the camp. Hard-coded placeholders for now — the names
 * are evocative of the roles we expect real Claude Code agents to play. Each
 * stands in front of their home (a house or tent), spread across the camp so
 * the player walks the roads between them.
 */
export const agents: AgentDescriptor[] = [
  { id: 'planner', name: 'Planner', tile: { column: 5, row: 6 }, dotColor: '#7c9cff', status: 'idle' },
  { id: 'builder', name: 'Builder', tile: { column: 12, row: 5 }, dotColor: '#6bd6a4', status: 'working' },
  { id: 'reviewer', name: 'Reviewer', tile: { column: 20, row: 6 }, dotColor: '#f0a868', status: 'idle' },
  { id: 'explorer', name: 'Explorer', tile: { column: 21, row: 14 }, dotColor: '#d58cf0', status: 'talking' }
]

/** Distance, in pixels, within which the player can interact with an agent. */
export const interactionRadius = tileSize * 1.6

/**
 * Convert a tile coordinate to the pixel position of that tile's centre.
 *
 * @param column - Zero-based column index.
 * @param row - Zero-based row index.
 * @returns Pixel coordinates of the tile centre.
 */
export function tileToPixel(column: number, row: number): { x: number; y: number } {
  return {
    x: column * tileSize + tileSize / 2,
    y: row * tileSize + tileSize / 2
  }
}
