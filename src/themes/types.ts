/**
 * Theme system. A theme bundles the artwork (a ground tileset, free-placed
 * object sprites, and a character spritesheet) with the data saying how to lay
 * them out. Swapping the whole look of the scene is a matter of selecting a
 * different Theme object — no rendering code changes.
 */

/** A spritesheet sliced into a uniform grid of frames. */
export interface SheetSpec {
  /** Public path to the image (served from `public/`). */
  path: string
  /** Edge length of one frame, in source pixels. */
  frameSize: number
  /** Transparent gap between frames in the sheet, in pixels. */
  margin: number
}

/**
 * The tiled ground. Frames are picked at random from `tiles` so a large area
 * looks varied rather than a single repeated cell. A separate `pathTile` paints
 * the authored walkable path on top of the base.
 */
export interface GroundSpec {
  sheet: SheetSpec
  /** Frame indices that may be used as base ground; chosen at random per cell. */
  tiles: number[]
  /** Frame index used to paint authored path cells. */
  pathTile: number
}

/**
 * A free-placed object sprite (house, tent, barrel, lamp…), loaded as its own
 * image at native size. Sprites are anchored by their bottom centre so taller
 * objects sit naturally on the ground.
 */
export interface ObjectSprite {
  /** Stable texture key. */
  key: string
  /** Public path to the image. */
  path: string
  /**
   * Collision footprint in tiles (width × height) centred on the object's
   * anchor cell. Zero width or height means the object does not block movement.
   */
  footprint: { width: number; height: number }
}

/** An object placed at a specific tile, with the agent (if any) that occupies it. */
export interface Placement {
  /** Key of the `ObjectSprite` to draw. */
  sprite: string
  /** Anchor cell (the object's bottom-centre rests at this tile). */
  column: number
  row: number
}

/** A complete look for the scene. */
export interface Theme {
  /** Stable identifier, used when persisting the chosen theme. */
  id: string
  /** Human-readable name shown in any theme picker. */
  name: string
  /** The tiled ground. */
  ground: GroundSpec
  /** Every object sprite the theme can place, keyed for lookup. */
  sprites: Record<string, ObjectSprite>
  /** The character spritesheet. */
  characters: SheetSpec
  /** Number of columns in the character sheet, for index→frame math. */
  characterColumns: number
  /** Character frame indices to assign to agents, in order. */
  characterFrames: number[]
  /** Sprite key each agent stands beside, in agent order (a home/tent). */
  agentStructures: string[]
  /** Authored walkable-path cells, painted with `ground.pathTile`. */
  path: Array<{ column: number; row: number }>
  /** Decorative objects scattered around the scene. */
  scatter: Placement[]
  /** Background colour shown outside the ground. */
  backgroundColor: string
}
