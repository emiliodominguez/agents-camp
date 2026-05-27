import { agents, officeColumns, officeRows } from '../world'
import type { Theme } from '../themes'

/** A single tile placement: which tile index goes at which grid cell. */
export interface Placement {
  column: number
  row: number
  index: number
}

/** The furnished room expressed as tile layers plus the cells that block movement. */
export interface Furnishing {
  /** Floor fill under everything. */
  floor: Placement[]
  /** Walls and furniture drawn above the floor, in draw order. */
  decor: Placement[]
  /** Grid cells the player cannot walk through (`"column,row"`). */
  blocked: Set<string>
}

/**
 * Compose the office from a theme: a floor fill, a single-tile perimeter wall,
 * one workstation per agent (desk + monitor one row above the agent's chair),
 * and a few decor props along the back wall. Walls and desks are impassable.
 *
 * @param theme - The active theme supplying tile indices.
 * @returns Tile placements split into floor and decor layers, plus blocked cells.
 */
export function furnish(theme: Theme): Furnishing {
  const floor: Placement[] = []
  const decor: Placement[] = []
  const blocked = new Set<string>()

  const block = (column: number, row: number): void => {
    blocked.add(`${column},${row}`)
  }

  const { floor: floorTile, wall, workstation, decor: decorTiles } = theme.tiles

  // Floor across the whole room.
  for (let row = 0; row < officeRows; row += 1) {
    for (let column = 0; column < officeColumns; column += 1) {
      floor.push({ column, row, index: floorTile })
    }
  }

  // Single-tile perimeter wall.
  for (let row = 0; row < officeRows; row += 1) {
    for (let column = 0; column < officeColumns; column += 1) {
      const onEdge = row === 0 || column === 0 || row === officeRows - 1 || column === officeColumns - 1

      if (onEdge) {
        decor.push({ column, row, index: wall })
        block(column, row)
      }
    }
  }

  // Decor props sitting just below the back wall.
  decorTiles.forEach((index, position) => {
    const column = 3 + position * 5

    decor.push({ column, row: 1, index })
  })

  // One workstation per agent. `tile` is the chair the agent sits at; the desk
  // and its monitor sit one row above.
  for (const agent of agents) {
    const { column, row } = agent.tile

    decor.push({ column, row: row - 1, index: workstation.desk })
    decor.push({ column, row: row - 1, index: workstation.monitor })

    block(column, row - 1)
  }

  return { floor, decor, blocked }
}
