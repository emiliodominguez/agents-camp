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
 * A workstation: a desk tile with a monitor on it, plus a pool of small desk
 * props (mug, pen cup, papers…) to scatter so no two desks look identical.
 * Everything sits one row above the agent's chair.
 */
export interface WorkstationRole {
  desk: number
  monitor: number
  /** Small props placed on the desk; one is chosen per workstation. */
  deskProps: number[]
}

/** Named tile roles used to furnish the room. Each value is a tile index. */
export interface TileRoles {
  /** Walkable floor tile (may itself contain a checkerboard pattern). */
  floor: number
  /** Perimeter wall tile. */
  wall: number
  /** Door tile placed in the top wall. */
  door: number
  /** The workstation tiles. */
  workstation: WorkstationRole
  /** Decorative props placed against the top wall. */
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
