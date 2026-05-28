import { officeColumns, officeRows, seedVillagers } from '../world'
import type { Placement, Theme } from '../themes'

/** A ground tile placed at a cell. */
export interface GroundPlacement {
  column: number
  row: number
  index: number
}

/** The dressed scene: ground tiles, free-placed object sprites, and blocked cells. */
export interface Furnishing {
  /** Ground fill under everything. */
  ground: GroundPlacement[]
  /** Object sprites (homes, decor) in draw order. */
  objects: Placement[]
  /** Grid cells the player cannot walk through (`"column,row"`). */
  blocked: Set<string>
}

/**
 * Deterministic pseudo-random in [0, 1) from two integers, so the ground looks
 * varied but renders identically every load.
 *
 * @param a - First seed component.
 * @param b - Second seed component.
 * @returns A stable value in [0, 1).
 */
function hashRandom(a: number, b: number): number {
  const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453

  return n - Math.floor(n)
}

/**
 * Mark the footprint of an object as blocked. The footprint is centred
 * horizontally on the anchor column and rises from the anchor row.
 *
 * @param theme - The active theme (for sprite footprints).
 * @param placement - The object placement.
 * @param blocked - The set to add blocked cells to.
 */
function blockFootprint(theme: Theme, placement: Placement, blocked: Set<string>): void {
  const spec = theme.sprites[placement.sprite]

  if (spec === undefined) {
    return
  }

  const { width, height } = spec.footprint

  if (width === 0 || height === 0) {
    return
  }

  const startColumn = placement.column - Math.floor((width - 1) / 2)

  for (let dy = 0; dy < height; dy += 1) {
    for (let dx = 0; dx < width; dx += 1) {
      blocked.add(`${startColumn + dx},${placement.row - dy}`)
    }
  }
}

/**
 * Compose the scene from a theme: a varied ground fill, each agent's home (a
 * house or tent) placed just above where the agent stands, and the theme's
 * scattered decor. Object footprints block movement.
 *
 * @param theme - The active theme supplying ground tiles and object sprites.
 * @returns Ground and object placements, plus blocked cells.
 */
export function furnish(theme: Theme): Furnishing {
  const ground: GroundPlacement[] = []
  const objects: Placement[] = []
  const blocked = new Set<string>()

  const groundTiles = theme.ground.tiles
  const pathCells = new Set(theme.path.map((cell) => `${cell.column},${cell.row}`))

  // Base ground across the whole scene, with authored path cells painted dirt.
  for (let row = 0; row < officeRows; row += 1) {
    for (let column = 0; column < officeColumns; column += 1) {
      if (pathCells.has(`${column},${row}`)) {
        ground.push({ column, row, index: theme.ground.pathTile })
        continue
      }

      const pick = Math.floor(hashRandom(column, row) * groundTiles.length)
      const index = groundTiles[pick] ?? groundTiles[0] ?? 0

      ground.push({ column, row, index })
    }
  }

  // Each seed villager's home sits one row above where they stand. Spawned
  // villagers' homes are added at runtime by the scene.
  for (const villager of seedVillagers) {
    if (theme.sprites[villager.structure] === undefined) {
      continue
    }

    const placement: Placement = {
      sprite: villager.structure,
      column: villager.tile.column,
      row: villager.tile.row - 1
    }

    objects.push(placement)
    blockFootprint(theme, placement, blocked)
  }

  // Scattered decor.
  for (const placement of theme.scatter) {
    objects.push(placement)
    blockFootprint(theme, placement, blocked)
  }

  // Draw objects back-to-front so nearer ones overlap farther ones.
  objects.sort((a, b) => a.row - b.row)

  return { ground, objects, blocked }
}
