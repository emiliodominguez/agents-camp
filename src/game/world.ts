/**
 * Static description of the scene: its grid dimensions, tile size, and the
 * *seed* villagers used to plan the initial layout (homes, reserved cells).
 *
 * The live runtime roster is server-owned — the WebSocket backend in `server/`
 * is the source of truth, and the client mirrors it in `src/state/roster.ts`.
 * This module only supplies the compile-time seed that the theme draws on for
 * its initial layout.
 */

import { defaultSeed, type Villager } from '../../shared/agents'

/** Lifecycle state of a villager, surfaced as a status bubble above its sprite. */
export type AgentStatus = 'idle' | 'working' | 'talking'

/** Rendered edge length of one tile, in pixels (matches the 32px source art). */
export const tileSize = 32

/** Scene size, measured in tiles. */
export const campColumns = 26
export const campRows = 20

/** The avatar the player drives around the scene. */
export const playerSpawn = { column: 12, row: 13 }

/**
 * The seed villagers — the ones who exist on first run and whose homes are
 * baked into the theme's layout. Spawned villagers are added at runtime.
 */
export const seedVillagers: Villager[] = defaultSeed()

/**
 * Empty plots scattered around the camp where you can spawn a new villager.
 * Each is a tile coordinate that's clear of roads, props, and homes.
 */
export const emptyPlots: Array<{ column: number; row: number }> = [
  { column: 8, row: 15 },
  { column: 17, row: 7 },
  { column: 4, row: 14 },
  { column: 16, row: 16 }
]

/** Distance, in pixels, within which the player can interact with someone or something. */
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
