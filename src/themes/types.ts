/**
 * Theme system. A theme bundles the artwork (a tileset for the room, a
 * spritesheet for characters) with the index map that says which tile or frame
 * plays which role. Swapping the whole look of the office is then a matter of
 * selecting a different Theme object — no rendering code changes.
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
 * Named tile roles used to furnish the room. Every value is an index into the
 * theme's tileset, counting left-to-right, top-to-bottom from zero.
 */
export interface TileRoles {
  /** Plain walkable floor fill. */
  floor: number
  /** Solid wall block used for the room's perimeter. */
  wall: number
  /** The three vertical segments of a desk, back to front. */
  deskBack: number
  deskMiddle: number
  deskFront: number
  /** A chair facing the desk. */
  chair: number
  /** A desktop computer prop placed on a desk. */
  computer: number
  /** A potted plant for decoration. */
  plant: number
}

/**
 * Accent rugs laid under each workstation. Indexed by the agent's `color`
 * family so workstations stay visually distinct. Each entry is a tile index.
 */
export interface RugPalette {
  blue: number
  green: number
  orange: number
}

/** A complete look for the office. */
export interface Theme {
  /** Stable identifier, used when persisting the chosen theme. */
  id: string
  /** Human-readable name shown in any theme picker. */
  name: string
  /** The room tileset. */
  tileset: SheetSpec
  /** The character spritesheet. */
  characters: SheetSpec
  /** Number of columns in the character sheet, for index→frame math. */
  characterColumns: number
  /** Character frame indices to assign to agents, in order. */
  characterFrames: number[]
  /** Tile-role index map for furnishing. */
  tiles: TileRoles
  /** Accent rug palette. */
  rugs: RugPalette
  /** Background colour shown outside the room. */
  backgroundColor: string
}
