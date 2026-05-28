import { emptyPlots, officeColumns, officeRows, playerSpawn, seedVillagers } from '../world'
import type { CharacterSpec, ObjectSprite, Placement, Theme } from './types'

/**
 * A medieval-village camp built from the CraftPix "Free Village / Top-Down
 * Defense" pack: a grass field crossed by worn dirt roads that wander in from
 * the edges of the world, with houses and tents the agents live beside and the
 * pack's crafting-and-market props (wood piles, anvils, barrels, market signs,
 * lamp posts, rocks) scattered for a lived-in feel. Kenney roguelike characters
 * stand in for the villagers until a matching pack lands.
 *
 * Tiles are 32px. Object sprites are placed at native size, anchored by their
 * bottom centre.
 */

const objectsBase = '/assets/themes/village/objects'

/**
 * Define an object sprite.
 *
 * @param key - Stable texture key.
 * @param path - Path under the objects folder (without extension).
 * @param width - Footprint width in tiles (0 to not block).
 * @param height - Footprint height in tiles (0 to not block).
 * @returns The object sprite spec.
 */
function sprite(key: string, path: string, width: number, height: number): ObjectSprite {
  return {
    key,
    path: `${objectsBase}/${path}.png`,
    footprint: { width, height }
  }
}

const spriteList: ObjectSprite[] = [
  // Homes.
  sprite('house-1', 'house/1', 3, 2),
  sprite('house-2', 'house/2', 3, 2),
  sprite('tent-1', 'tent/1', 2, 1),
  sprite('tent-2', 'tent/2', 2, 1),
  // Lighting and market dressing.
  sprite('lamp-1', 'decor/9', 1, 1),
  sprite('lamp-2', 'decor/10', 1, 1),
  sprite('lamp-3', 'decor/11', 1, 1),
  sprite('sign-1', 'decor/14', 1, 1),
  sprite('sign-2', 'decor/15', 1, 1),
  sprite('sign-3', 'decor/16', 1, 1),
  // Crafting clutter.
  sprite('anvil', 'decor/7', 1, 1),
  sprite('bench', 'decor/8', 1, 1),
  sprite('woodpile', 'decor/1', 2, 1),
  sprite('cart', 'decor/2', 2, 1),
  sprite('logs', 'decor/3', 1, 1),
  sprite('bricks', 'decor/5', 1, 1),
  // Storage.
  sprite('barrel', 'box/1', 1, 1),
  sprite('barrel-2', 'box/2', 1, 1),
  sprite('crate', 'box/3', 1, 1),
  sprite('crate-2', 'box/4', 1, 1),
  // Rocks — bigger ones block, pebbles do not.
  sprite('rock-big', 'stone/1', 1, 1),
  sprite('rock', 'stone/3', 1, 1),
  sprite('pebble-1', 'stone/4', 0, 0),
  sprite('pebble-2', 'stone/5', 0, 0),
  // Grass tufts and flowers are decoration only — they never block movement.
  sprite('tuft-1', 'grass/2', 0, 0),
  sprite('tuft-2', 'grass/4', 0, 0),
  sprite('tuft-3', 'grass/6', 0, 0),
  sprite('tuft-4', 'grass/1', 0, 0),
  sprite('tuft-5', 'grass/3', 0, 0),
  sprite('tuft-6', 'grass/5', 0, 0),
  // Trees and vegetation (generated; warm palette, several seeded variants).
  // Trees and pines block at their trunk; bushes block lightly; flowers are
  // decoration.
  sprite('tree-1', 'foliage/tree-1', 1, 1),
  sprite('tree-2', 'foliage/tree-2', 1, 1),
  sprite('tree-3', 'foliage/tree-3', 1, 1),
  sprite('tree-4', 'foliage/tree-4', 1, 1),
  sprite('tree-5', 'foliage/tree-5', 1, 1),
  sprite('tree-6', 'foliage/tree-6', 1, 1),
  sprite('pine-1', 'foliage/pine-1', 1, 1),
  sprite('pine-2', 'foliage/pine-2', 1, 1),
  sprite('pine-3', 'foliage/pine-3', 1, 1),
  sprite('bush-1', 'foliage/bush-1', 1, 1),
  sprite('bush-2', 'foliage/bush-2', 1, 1),
  sprite('bush-3', 'foliage/bush-3', 1, 1),
  sprite('flowers-1', 'foliage/flowers-1', 0, 0),
  sprite('flowers-2', 'foliage/flowers-2', 0, 0)
]

/**
 * Deterministic pseudo-random in [0, 1) from a single seed, so the world wanders
 * organically but renders identically on every load.
 *
 * @param seed - Any number.
 * @returns A stable value in [0, 1).
 */
function rand(seed: number): number {
  const n = Math.sin(seed * 12.9898) * 43758.5453

  return n - Math.floor(n)
}

const maxColumn = officeColumns - 1
const maxRow = officeRows - 1

type Cell = { column: number; row: number }

/**
 * Paint a single road tile (clamped to the world).
 *
 * @param column - Column to paint.
 * @param row - Row to paint.
 * @param cells - Destination set (`"column,row"`).
 */
function paintCell(column: number, row: number, cells: Set<string>): void {
  const cc = Math.min(maxColumn, Math.max(0, column))
  const rr = Math.min(maxRow, Math.max(0, row))

  cells.add(`${cc},${rr}`)
}

/**
 * Walk an organic road between two points. The road follows its dominant axis
 * as a spine and curves with a smooth, seeded sine meander on the perpendicular
 * axis — a worn ribbon rather than a ruled line. The track is `width` tiles
 * thick across the spine, and the spine itself is continuous (no staircase
 * gaps), so the road always reads as one clear path.
 *
 * @param from - Start cell.
 * @param to - End cell.
 * @param width - Road thickness across the spine (1 = single track, 2 = wide).
 * @param seed - Seed so each road meanders differently but reproducibly.
 * @param cells - The set the painted cells are added to (`"column,row"`).
 */
function walkRoad(from: Cell, to: Cell, width: number, seed: number, cells: Set<string>): void {
  const dColumn = to.column - from.column
  const dRow = to.row - from.row
  const horizontal = Math.abs(dColumn) >= Math.abs(dRow)

  const span = horizontal ? Math.abs(dColumn) : Math.abs(dRow)

  if (span === 0) {
    paintCell(from.column, from.row, cells)

    return
  }

  // A gentle meander: amplitude grows with road length, up to ~2 tiles.
  const amplitude = Math.min(2, span / 8)
  const frequency = 0.45 + rand(seed) * 0.4
  const phase = rand(seed + 1) * Math.PI * 2
  const half = Math.floor((width - 1) / 2)

  // Paint a track of `width` tiles across the perpendicular axis, centred on a
  // spine cell.
  const paintTrack = (centerColumn: number, centerRow: number): void => {
    for (let w = -half; w <= width - 1 - half; w += 1) {
      if (horizontal) {
        paintCell(centerColumn, centerRow + w, cells)
      } else {
        paintCell(centerColumn + w, centerRow, cells)
      }
    }
  }

  let previousMinor: number | undefined

  for (let i = 0; i <= span; i += 1) {
    const t = i / span

    // Position along the spine, interpolated end to end.
    const spineColumn = horizontal ? from.column + Math.sign(dColumn) * i : Math.round(from.column + dColumn * t)
    const spineRow = horizontal ? Math.round(from.row + dRow * t) : from.row + Math.sign(dRow) * i

    // Perpendicular meander offset, faded out near both ends so junctions meet
    // cleanly.
    const fade = Math.sin(t * Math.PI)
    const offset = Math.round(Math.sin(i * frequency + phase) * amplitude * fade)

    const centerColumn = horizontal ? spineColumn : spineColumn + offset
    const centerRow = horizontal ? spineRow + offset : spineRow

    const minor = horizontal ? centerRow : centerColumn

    // Bridge any jump in the minor axis since the last step so the spine stays
    // connected through curves (no diagonal gaps).
    if (previousMinor !== undefined && Math.abs(minor - previousMinor) > 0) {
      const stepDir = Math.sign(minor - previousMinor)

      for (let m = previousMinor; m !== minor; m += stepDir) {
        if (horizontal) {
          paintTrack(centerColumn, m)
        } else {
          paintTrack(m, centerRow)
        }
      }
    }

    paintTrack(centerColumn, centerRow)
    previousMinor = minor
  }

  paintCell(to.column, to.row, cells)
}

/**
 * Author the road network: a main road that winds in from the top edge down to
 * the bottom edge, a crossing road from the left edge to the right edge, and a
 * branch from each road out to every agent's home and the player's spawn. Roads
 * are painted with the dirt tile over the grass base.
 *
 * @returns The set of dirt-road cells.
 */
function buildPath(): Cell[] {
  const cells = new Set<string>()

  // A small market plaza near the middle where the two main roads cross. The
  // roads run through it; the plaza gives the junction a deliberate, paved feel
  // instead of a blob where the ribbons happen to overlap.
  const hub: Cell = { column: 12, row: 11 }

  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      paintCell(hub.column + dx, hub.row + dy, cells)
    }
  }

  // Main road: top edge -> plaza -> bottom edge (the village's spine).
  walkRoad({ column: 11, row: 0 }, hub, 1, 11, cells)
  walkRoad(hub, { column: 13, row: maxRow }, 1, 23, cells)

  // Cross road: left edge -> plaza -> right edge.
  walkRoad({ column: 0, row: 10 }, hub, 1, 37, cells)
  walkRoad(hub, { column: maxColumn, row: 12 }, 1, 51, cells)

  // A width-1 branch from each agent's standing tile to the plaza. Aiming every
  // branch at the plaza guarantees the whole network is connected; the meander
  // and differing seeds keep them from overlapping into a single stripe.
  const branchSeeds = [61, 67, 71, 73]

  seedVillagers.forEach((agent, position) => {
    walkRoad({ column: agent.tile.column, row: agent.tile.row }, hub, 1, branchSeeds[position] ?? 60, cells)
  })

  // A short branch from the player's spawn up to the plaza.
  walkRoad(playerSpawn, hub, 1, 79, cells)

  return Array.from(cells).map((key) => {
    const [column, row] = key.split(',').map(Number)

    return { column: column ?? 0, row: row ?? 0 }
  })
}

const pathCells = buildPath()
const pathKeys = new Set(pathCells.map((cell) => `${cell.column},${cell.row}`))
const isPath = (column: number, row: number): boolean => pathKeys.has(`${column},${row}`)

/**
 * Cells reserved by the seed villagers, their homes, and the player so
 * scattered decor never lands on a character or a building. A home occupies a
 * footprint-sized block one row above the villager (matching `furnish`), plus
 * a clear tile around each character.
 */
const reservedKeys = (() => {
  const keys = new Set<string>()
  const reserve = (column: number, row: number): void => {
    keys.add(`${column},${row}`)
  }

  // A small clear ring around the player spawn.
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      reserve(playerSpawn.column + dx, playerSpawn.row + dy)
    }
  }

  // Keep empty plots clear so a spawn affordance can sit there.
  for (const plot of emptyPlots) {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        reserve(plot.column + dx, plot.row + dy)
      }
    }
  }

  for (const villager of seedVillagers) {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        reserve(villager.tile.column + dx, villager.tile.row + dy)
      }
    }

    const structure = spriteList.find((entry) => entry.key === villager.structure)

    if (structure === undefined) {
      continue
    }

    const { width, height } = structure.footprint
    const homeRow = villager.tile.row - 1
    const startColumn = villager.tile.column - Math.floor((width - 1) / 2)

    for (let dy = -1; dy <= height; dy += 1) {
      for (let dx = -1; dx <= width; dx += 1) {
        reserve(startColumn + dx, homeRow - dy + 1)
      }
    }
  }

  return keys
})()

/**
 * Scatter decor and obstacles across the field, avoiding the roads. Lamp posts
 * and market signs line the roads' edges; wood piles, anvils, carts and barrels
 * cluster near the homes; rocks and grass tufts dress the open grass. Tufts and
 * pebbles never block; everything else does.
 *
 * @returns The placements, road-clear and deterministic.
 */
function buildScatter(): Placement[] {
  const placements: Placement[] = []
  const taken = new Set<string>()

  const add = (sprite: string, column: number, row: number, offsetX = 0, offsetY = 0): void => {
    if (column < 0 || column > maxColumn || row < 0 || row > maxRow) {
      return
    }

    const key = `${column},${row}`

    if (reservedKeys.has(key) || isPath(column, row) || taken.has(key)) {
      return
    }

    taken.add(key)
    placements.push({ sprite, column, row, offsetX, offsetY })
  }

  // Lamp posts lining the roads, hand-placed near the hub and road mouths so
  // the avenues read as travelled. (Hanging-sign sprites were here too, but
  // their asymmetric posts read as "chopped" next to other props.)
  add('lamp-1', 9, 11)
  add('lamp-2', 15, 11)
  add('lamp-3', 12, 8)
  add('lamp-1', 4, 9)
  add('lamp-2', 22, 12)
  add('lamp-3', 17, 13)

  // Workshop clutter clustered around the homes.
  add('anvil', 6, 8)
  add('woodpile', 3, 8)
  add('logs', 7, 9)
  add('bench', 14, 8)
  add('cart', 11, 8)
  add('barrel', 19, 8)
  add('crate', 21, 9)
  add('bricks', 18, 9)
  add('barrel-2', 23, 15)
  add('crate-2', 20, 16)
  add('bench', 19, 16)

  // Deterministically scatter grass, flowers, bushes, the odd rock, and the
  // occasional tree over the open field, skipping the roads so the player
  // always has clear ground to walk. Vegetation is weighted toward warm,
  // living things (tufts, flowers, bushes) over bare rock.
  const nature: Array<{ sprite: string; weight: number }> = [
    { sprite: 'tuft-1', weight: 3 },
    { sprite: 'tuft-2', weight: 3 },
    { sprite: 'tuft-3', weight: 3 },
    { sprite: 'tuft-4', weight: 3 },
    { sprite: 'tuft-5', weight: 3 },
    { sprite: 'tuft-6', weight: 3 },
    { sprite: 'flowers-1', weight: 3 },
    { sprite: 'bush-1', weight: 2 },
    { sprite: 'bush-2', weight: 2 },
    { sprite: 'tree-1', weight: 1 },
    { sprite: 'tree-2', weight: 1 },
    { sprite: 'pine-1', weight: 1 },
    { sprite: 'pebble-1', weight: 1 },
    { sprite: 'rock', weight: 1 }
  ]

  // Expand weights into a flat pool for simple weighted picking.
  const pool: string[] = []

  for (const { sprite: key, weight } of nature) {
    for (let count = 0; count < weight; count += 1) {
      pool.push(key)
    }
  }

  let seed = 100

  for (let row = 0; row <= maxRow; row += 1) {
    for (let column = 0; column <= maxColumn; column += 1) {
      seed += 1

      if (isPath(column, row)) {
        continue
      }

      const roll = rand(seed)

      // Roughly a third of off-road cells get a natural decoration.
      if (roll > 0.32) {
        continue
      }

      const choice = pool[Math.floor(rand(seed * 3.1) * pool.length)]

      if (choice !== undefined) {
        // Small sub-tile jitter so field decor doesn't sit on a perfect grid.
        const jx = Math.round((rand(seed * 5.2) - 0.5) * 10)
        const jy = Math.round((rand(seed * 7.7) - 0.5) * 8)
        add(choice, column, row, jx, jy)
      }
    }
  }

  // An irregular forest band rings the world so the camp nestles in a clearing.
  // Rather than one ruled row, each edge cell gets a *probabilistic* depth of
  // trees with random species, sub-tile jitter, and occasional gaps — so the
  // treeline reads as a natural wood, not a fence. Road mouths stay clear
  // because `add` skips path cells.
  const trees = ['tree-1', 'tree-2', 'tree-3', 'tree-4', 'tree-5', 'tree-6', 'pine-1', 'pine-2', 'pine-3']
  const undergrowth = ['bush-1', 'bush-2', 'bush-3', 'flowers-1', 'flowers-2']
  let forestSeed = 5000

  /**
   * Plant a clump of edge forest at a cell: a tree most of the time (with
   * jitter), sometimes undergrowth, sometimes a gap.
   *
   * @param column - Cell column.
   * @param row - Cell row.
   * @param density - Probability [0,1] that anything is planted here.
   */
  const plantEdge = (column: number, row: number, density: number): void => {
    forestSeed += 1
    const roll = rand(forestSeed)

    if (roll > density) {
      return
    }

    const jx = Math.round((rand(forestSeed * 2.3) - 0.5) * 14)
    const jy = Math.round((rand(forestSeed * 3.9) - 0.5) * 12)

    if (roll < density * 0.72) {
      const tree = trees[Math.floor(rand(forestSeed * 5.1) * trees.length)] ?? 'tree-1'
      add(tree, column, row, jx, jy)
    } else {
      const plant = undergrowth[Math.floor(rand(forestSeed * 6.3) * undergrowth.length)] ?? 'bush-1'
      add(plant, column, row, jx, jy)
    }
  }

  // Top and bottom bands: dense at the very edge, thinning inward over 3 rows.
  for (let column = 0; column <= maxColumn; column += 1) {
    plantEdge(column, 0, 0.95)
    plantEdge(column, 1, 0.6)
    plantEdge(column, 2, 0.28)
    plantEdge(column, maxRow, 0.95)
    plantEdge(column, maxRow - 1, 0.6)
    plantEdge(column, maxRow - 2, 0.28)
  }

  // Left and right bands (skip the corners already done above).
  for (let row = 1; row < maxRow; row += 1) {
    plantEdge(0, row, 0.95)
    plantEdge(1, row, 0.6)
    plantEdge(2, row, 0.28)
    plantEdge(maxColumn, row, 0.95)
    plantEdge(maxColumn - 1, row, 0.6)
    plantEdge(maxColumn - 2, row, 0.28)
  }

  return placements
}

/**
 * One CraftPix citizen per agent (and the player reuses the first). Each
 * direction has a 48px idle strip (4 frames) and walk strip (6 frames).
 *
 * @param index - Citizen folder number (1–4).
 * @returns The character spec.
 */
function citizen(index: number): CharacterSpec {
  return {
    key: `citizen-${index}`,
    pathPrefix: `/assets/characters/citizens/citizen-${index}`,
    frameSize: 48,
    idleFrames: 4,
    walkFrames: 6
  }
}

// Agents take citizens 1–4 in order; the player avatar reuses citizen 1.
const characters: CharacterSpec[] = [citizen(1), citizen(2), citizen(3), citizen(4)]

export const villageTheme: Theme = {
  id: 'village',
  name: 'Village Camp',
  // Index 37 is the only solid-grass tile; index 19 is solid dirt. The base is
  // solid grass with texture added via scattered grass-tuft objects, and the
  // authored roads are painted with the dirt tile.
  ground: {
    sheet: { path: '/assets/themes/village/fields.png', frameSize: 32, margin: 0 },
    tiles: [37],
    pathTile: 19
  },
  sprites: Object.fromEntries(spriteList.map((entry) => [entry.key, entry])),
  characters,
  path: pathCells,
  scatter: buildScatter(),
  // A warm, grass-matching green so the world edges blend into the background
  // rather than revealing dark void when the camera reaches a boundary.
  backgroundColor: '#8aab5a'
}
