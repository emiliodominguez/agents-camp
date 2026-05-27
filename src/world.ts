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
  /** Workstation position in tile coordinates (column, row) — the chair tile. */
  tile: { column: number; row: number }
  /** Colour of the agent's dot in the roster overlay (CSS hex). */
  dotColor: string
  /** Current lifecycle state. */
  status: AgentStatus
}

/** Rendered edge length of one tile, in pixels (matches the 32px source art). */
export const tileSize = 32

/** Office floor size, measured in tiles (includes the perimeter wall). */
export const officeColumns = 14
export const officeRows = 11

/** The avatar the player drives around the room. */
export const playerSpawn = { column: 7, row: 8 }

/**
 * The agents currently in the office. Hard-coded placeholders for now — the
 * names are evocative of the roles we expect real Claude Code agents to play.
 * Workstations are grouped into two facing pods so the room reads as a real
 * office rather than desks scattered in empty space. `tile` is the chair the
 * agent occupies; the desk sits one row above.
 */
export const agents: AgentDescriptor[] = [
  { id: 'planner', name: 'Planner', tile: { column: 3, row: 3 }, dotColor: '#7c9cff', status: 'idle' },
  { id: 'builder', name: 'Builder', tile: { column: 5, row: 3 }, dotColor: '#6bd6a4', status: 'working' },
  { id: 'reviewer', name: 'Reviewer', tile: { column: 9, row: 3 }, dotColor: '#f0a868', status: 'idle' },
  { id: 'explorer', name: 'Explorer', tile: { column: 11, row: 3 }, dotColor: '#d58cf0', status: 'talking' }
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
