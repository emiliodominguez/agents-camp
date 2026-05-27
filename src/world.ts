/**
 * Static description of the office world: its grid dimensions, tile size, and
 * the agents that occupy it. For this first pass the agents are hard-coded so
 * we can see the office before any Claude wiring exists. Later the backend will
 * supply this list (and live status) over a WebSocket.
 */

/** Lifecycle state of an agent, surfaced as a status bubble above its sprite. */
export type AgentStatus = 'idle' | 'working' | 'talking'

/** A single character in the office. */
export interface AgentDescriptor {
  /** Stable identifier used to address the agent's session later. */
  id: string
  /** Display name shown on the floor label. */
  name: string
  /** Desk position in tile coordinates (column, row). */
  tile: { column: number; row: number }
  /** Tint applied to the placeholder sprite so agents are distinguishable. */
  color: number
  /** Current lifecycle state. */
  status: AgentStatus
}

/** Edge length of one square tile, in pixels. */
export const tileSize = 32

/** Office floor size, measured in tiles. */
export const officeColumns = 24
export const officeRows = 16

/** The avatar the player drives around the room. */
export const playerSpawn = { column: 4, row: 12 }

/**
 * The agents currently in the office. Hard-coded placeholders for now — the
 * names are evocative of the roles we expect real Claude Code agents to play.
 */
export const agents: AgentDescriptor[] = [
  { id: 'planner', name: 'Planner', tile: { column: 6, row: 4 }, color: 0x7c9cff, status: 'idle' },
  { id: 'builder', name: 'Builder', tile: { column: 11, row: 4 }, color: 0x6bd6a4, status: 'working' },
  { id: 'reviewer', name: 'Reviewer', tile: { column: 16, row: 4 }, color: 0xf0a868, status: 'idle' },
  { id: 'explorer', name: 'Explorer', tile: { column: 19, row: 9 }, color: 0xd58cf0, status: 'talking' }
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
