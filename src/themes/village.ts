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
  sprite('stall', 'decor/14', 2, 1),
  sprite('barrel', 'box/1', 1, 1),
  sprite('crate', 'box/3', 1, 1),
  sprite('stone', 'stone/1', 1, 1)
]

/** Decorative objects dotted around the camp. */
const scatter: Placement[] = [
  { sprite: 'lamp', column: 2, row: 2 },
  { sprite: 'lamp', column: 11, row: 2 },
  { sprite: 'lamp', column: 2, row: 9 },
  { sprite: 'lamp', column: 11, row: 9 },
  { sprite: 'stall', column: 6, row: 8 },
  { sprite: 'barrel', column: 4, row: 8 },
  { sprite: 'crate', column: 5, row: 8 },
  { sprite: 'stone', column: 9, row: 8 },
  { sprite: 'stone', column: 3, row: 5 },
  { sprite: 'barrel', column: 10, row: 5 }
]

export const villageTheme: Theme = {
  id: 'village',
  name: 'Village Camp',
  // The Fields sheet is a dirt-on-grass autotile set: almost every cell is
  // cobblestone, and only index 37 is solid grass. Scattering the dirt tiles
  // reads as noise, so the field is laid as solid grass (a dirt-path autotiler
  // could come later).
  ground: {
    sheet: { path: '/assets/themes/village/fields.png', frameSize: 32, margin: 0 },
    tiles: [37]
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
  scatter,
  backgroundColor: '#2f3a24'
}
