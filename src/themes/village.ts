import type { ObjectSprite, Placement, Theme } from './types'

/**
 * A medieval-village camp: cobblestone ground from the CraftPix "Free Village /
 * Top-Down Defense" pack, with houses and tents the agents live beside, and
 * lamp posts, barrels, crates and stones scattered for a lived-in feel. Kenney
 * roguelike characters stand in for the villagers until a matching pack lands.
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
  sprite('house-1', 'house/1', 3, 2),
  sprite('house-2', 'house/2', 3, 2),
  sprite('tent-1', 'tent/1', 2, 1),
  sprite('tent-2', 'tent/2', 2, 1),
  sprite('lamp', 'decor/9', 1, 1),
  sprite('barrel', 'box/1', 1, 1),
  sprite('crate', 'box/3', 1, 1),
  sprite('stone', 'stone/1', 1, 1),
  sprite('rock', 'stone/3', 1, 1),
  // Grass tufts and flowers are decoration only — they never block movement.
  sprite('tuft-1', 'grass/2', 0, 0),
  sprite('tuft-2', 'grass/4', 0, 0),
  sprite('tuft-3', 'grass/6', 0, 0)
]

/**
 * Authored walkable path: a horizontal avenue across the camp at row 7, with
 * vertical spurs up to each agent's standing tile and down to the player spawn.
 * The agents stand at columns 3, 7, 10, 12 (row 5) and 12 (row 8); the player
 * spawns at (7, 9).
 */
function buildPath(): Array<{ column: number; row: number }> {
  const cells: Array<{ column: number; row: number }> = []
  const avenueRow = 7

  for (let column = 3; column <= 12; column += 1) {
    cells.push({ column, row: avenueRow })
  }

  // Spurs up to each agent (columns 3, 7, 10) and the player spur down.
  for (const column of [3, 7, 10]) {
    for (let row = 5; row < avenueRow; row += 1) {
      cells.push({ column, row })
    }
  }

  // Explorer sits lower-right (12, 8); player spawn (7, 9).
  cells.push({ column: 12, row: 8 })
  cells.push({ column: 7, row: 8 })
  cells.push({ column: 7, row: 9 })

  return cells
}

/**
 * Decorative and obstacle objects. Lamps light the path; barrels, crates and
 * stones sit off the path as obstacles to walk around; grass tufts add texture.
 */
const scatter: Placement[] = [
  { sprite: 'lamp', column: 2, row: 7 },
  { sprite: 'lamp', column: 13, row: 7 },
  { sprite: 'barrel', column: 5, row: 9 },
  { sprite: 'crate', column: 6, row: 10 },
  { sprite: 'stone', column: 9, row: 9 },
  { sprite: 'rock', column: 2, row: 4 },
  { sprite: 'stone', column: 11, row: 10 },
  { sprite: 'rock', column: 8, row: 3 },
  { sprite: 'tuft-1', column: 1, row: 2 },
  { sprite: 'tuft-2', column: 4, row: 10 },
  { sprite: 'tuft-3', column: 9, row: 2 },
  { sprite: 'tuft-1', column: 13, row: 3 },
  { sprite: 'tuft-2', column: 6, row: 6 },
  { sprite: 'tuft-3', column: 1, row: 10 }
]

export const villageTheme: Theme = {
  id: 'village',
  name: 'Village Camp',
  // Index 37 is the only solid-grass tile; index 19 is solid dirt. The base is
  // solid grass with texture added via scattered grass-tuft objects, and the
  // authored path is painted with the dirt tile.
  ground: {
    sheet: { path: '/assets/themes/village/fields.png', frameSize: 32, margin: 0 },
    tiles: [37],
    pathTile: 19
  },
  sprites: Object.fromEntries(spriteList.map((entry) => [entry.key, entry])),
  characters: {
    path: '/assets/characters/roguelike.png',
    frameSize: 16,
    margin: 1
  },
  characterColumns: 54,
  characterFrames: [0, 2 * 54 + 1, 5 * 54, 7 * 54 + 1, 9 * 54],
  agentStructures: ['house-1', 'tent-1', 'house-2', 'tent-2'],
  path: buildPath(),
  scatter,
  backgroundColor: '#2f3a24'
}
