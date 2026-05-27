/**
 * Static description of the office world: its grid dimensions, tile size, and
 * the agents that occupy it. For this first pass the agents are hard-coded so
 * we can see the office before any Claude wiring exists. Later the backend will
 * supply this list (and live status) over a WebSocket.
 */

/** Lifecycle state of an agent, surfaced as a status bubble above its sprite. */
export type AgentStatus = 'idle' | 'working' | 'talking'

/** Which accent rug colour a workstation uses (keys the theme's rug palette). */
export type RugKey = 'blue' | 'green' | 'orange'

/** A single character in the office. */
export interface AgentDescriptor {
  /** Stable identifier used to address the agent's session later. */
  id: string
  /** Display name shown on the floor label. */
  name: string
  /** Workstation position in tile coordinates (column, row) — the chair tile. */
  tile: { column: number; row: number }
  /** Accent rug colour for this workstation. */
  rug: RugKey
  /** Colour of the agent's dot in the roster overlay (CSS hex). */
  dotColor: string
  /** Current lifecycle state. */
  status: AgentStatus
}

/**
 * Rendered edge length of one tile, in pixels. The source art is 16px; we draw
 * at 2× so the pixel art reads clearly on modern displays.
 */
export const tileSize = 32

/** Office floor size, measured in tiles (includes the perimeter wall). */
export const officeColumns = 20
export const officeRows = 14

/** The avatar the player drives around the room. */
export const playerSpawn = { column: 10, row: 11 }

/**
 * The agents currently in the office. Hard-coded placeholders for now — the
 * names are evocative of the roles we expect real Claude Code agents to play.
 * Each sits at a workstation; `tile` is the chair the agent occupies, with the
 * desk one row above it.
 */
export const agents: AgentDescriptor[] = [
  { id: 'planner', name: 'Planner', tile: { column: 3, row: 4 }, rug: 'blue', dotColor: '#7c9cff', status: 'idle' },
  { id: 'builder', name: 'Builder', tile: { column: 8, row: 4 }, rug: 'green', dotColor: '#6bd6a4', status: 'working' },
  {
    id: 'reviewer',
    name: 'Reviewer',
    tile: { column: 13, row: 4 },
    rug: 'orange',
    dotColor: '#f0a868',
    status: 'idle'
  },
  {
    id: 'explorer',
    name: 'Explorer',
    tile: { column: 16, row: 9 },
    rug: 'blue',
    dotColor: '#d58cf0',
    status: 'talking'
  }
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
