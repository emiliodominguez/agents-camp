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

/** Which group a character belongs to (used to section the spawn picker). */
export type CharacterCategory = 'villagers' | 'archers' | 'forest'

/**
 * One playable/agent character with directional idle and walk animations. Each
 * direction is its own strip (frames laid out left-to-right); the side strip
 * is mirrored for left vs right at render time. Different packs use different
 * filenames for "idle" and "walk", so each state declares its own source
 * suffix (e.g. citizens use `_idle`/`_walk`, while archers reuse `_idle` for
 * both states).
 */
export interface CharacterSpec {
  /** Stable texture key (also the prefix for per-direction texture keys). */
  key: string
  /** Public path prefix for the sprite folder (e.g. `/assets/packs/citizens/1`). */
  pathPrefix: string
  /** Edge length of one (square) frame, in source pixels. */
  frameSize: number
  /** Source for the idle animation. */
  idle: { suffix: string; frames: number }
  /** Source for the walk animation. */
  walk: { suffix: string; frames: number }
  /** Group used to section the spawn picker. */
  category: CharacterCategory
  /** Human-readable label shown in the picker. */
  label: string
}

/** A looping object sprite strip, with frames laid out left-to-right. */
export interface ObjectAnimationSpec {
  frameWidth: number
  frameHeight: number
  frames: number
  frameRate: number
}

/**
 * A free-placed object sprite (house, tent, barrel, lamp…), loaded at native
 * size. Static sprites are plain images; animated sprites are horizontal strips.
 * Objects are anchored by their bottom centre so taller sprites sit naturally
 * on the ground.
 */
export interface ObjectSprite {
  /** Stable texture key. */
  key: string
  /** Public path to the image. */
  path: string
  /** Optional looping animation for horizontal sprite strips. */
  animation?: ObjectAnimationSpec
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
  /** Optional pixel jitter from the cell centre, to break up grid alignment. */
  offsetX?: number
  offsetY?: number
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
  /**
   * One idle character strip per agent, in agent order. The last entry is also
   * reused for the player avatar.
   */
  characters: CharacterSpec[]
  /** Authored walkable-path cells, painted with `ground.pathTile`. */
  path: Array<{ column: number; row: number }>
  /** Decorative objects scattered around the scene. */
  scatter: Placement[]
  /** Background colour shown outside the ground. */
  backgroundColor: string
}
