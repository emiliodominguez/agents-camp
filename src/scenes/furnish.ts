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
 * Compose the office from a theme: a checkerboard floor, a perimeter wall (a
 * two-row band along the top, single tiles elsewhere), one workstation per
 * agent (desk surface + legs + monitor above the agent's chair), and a few
 * decor props along the back wall. Walls and desks are impassable.
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

  const { floor: floorTiles, wall, workstation, decor: decorTiles } = theme.tiles

  // Checkerboard floor across the whole room.
  for (let row = 0; row < officeRows; row += 1) {
    for (let column = 0; column < officeColumns; column += 1) {
      const checker = (row + column) % 2 === 0 ? floorTiles.light : floorTiles.dark

      floor.push({ column, row, index: checker })
    }
  }

  // Perimeter wall. The top edge is a two-row band (body then baseboard); the
  // left, right, and bottom edges are a single body tile.
  for (let column = 0; column < officeColumns; column += 1) {
    decor.push({ column, row: 0, index: wall.body })
    decor.push({ column, row: 1, index: wall.base })

    decor.push({ column, row: officeRows - 1, index: wall.body })

    block(column, 0)
    block(column, 1)
    block(column, officeRows - 1)
  }

  for (let row = 2; row < officeRows - 1; row += 1) {
    decor.push({ column: 0, row, index: wall.body })
    decor.push({ column: officeColumns - 1, row, index: wall.body })

    block(0, row)
    block(officeColumns - 1, row)
  }

  // Decor props sitting just below the back wall.
  decorTiles.forEach((index, position) => {
    const column = 3 + position * 5

    decor.push({ column, row: 2, index })
  })

  // One workstation per agent. `tile` is the chair the agent sits at; above it
  // sit the desk legs, then the desk surface with a monitor resting on it.
  for (const agent of agents) {
    const { column, row } = agent.tile

    decor.push({ column, row: row - 1, index: workstation.deskLegs })
    decor.push({ column, row: row - 2, index: workstation.deskSurface })
    decor.push({ column, row: row - 2, index: workstation.monitor })

    block(column, row - 1)
    block(column, row - 2)
  }

  return { floor, decor, blocked }
}
