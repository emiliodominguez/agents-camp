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
 * Floor fill. The two indices alternate in a checkerboard; pass the same value
 * twice for a plain floor.
 */
export interface FloorRole {
  light: number
  dark: number
}

/**
 * The wall band along the room's top edge: a body row and the baseboard row
 * where it meets the floor. Side and bottom edges reuse `body`.
 */
export interface WallRole {
  body: number
  base: number
}

/**
 * A workstation: a desk built from a surface tile over a legs tile, with a
 * monitor sitting on the surface. Tiles are stacked vertically at the agent's
 * column. The chair is the character's own tile (the agent sprite sits there).
 */
export interface WorkstationRole {
  deskSurface: number
  deskLegs: number
  monitor: number
}

/** Named tile roles used to furnish the room. */
export interface TileRoles {
  floor: FloorRole
  wall: WallRole
  workstation: WorkstationRole
  /** A decorative prop placed against the top wall. */
  decor: number[]
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
  /** Background colour shown outside the room. */
  backgroundColor: string
}
