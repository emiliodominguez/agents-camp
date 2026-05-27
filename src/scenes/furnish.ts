import { agents, officeColumns, officeRows, type RugKey } from '../world'
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
  /** Walls and furniture drawn above the floor. */
  decor: Placement[]
  /** Grid cells the player cannot walk through (`"column,row"`). */
  blocked: Set<string>
}

/**
 * Compose the office from a theme: a floor fill, a perimeter wall, and one
 * workstation (rug + desk + computer + chair) per agent, with a few plants in
 * the corners. Walls and desks are marked impassable.
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

  // Floor everywhere, then a wall ring around the perimeter.
  for (let row = 0; row < officeRows; row += 1) {
    for (let column = 0; column < officeColumns; column += 1) {
      floor.push({ column, row, index: theme.tiles.floor })

      const onEdge = row === 0 || column === 0 || row === officeRows - 1 || column === officeColumns - 1

      if (onEdge) {
        decor.push({ column, row, index: theme.tiles.wall })
        block(column, row)
      }
    }
  }

  const rugIndex: Record<RugKey, number> = {
    blue: theme.rugs.blue,
    green: theme.rugs.green,
    orange: theme.rugs.orange
  }

  // One workstation per agent. `tile` is the chair; the desk sits one row up.
  for (const agent of agents) {
    const { column, row } = agent.tile

    floor.push({ column, row: row - 1, index: rugIndex[agent.rug] })

    decor.push({ column, row: row - 2, index: theme.tiles.deskBack })
    decor.push({ column, row: row - 1, index: theme.tiles.deskFront })
    decor.push({ column, row: row - 1, index: theme.tiles.computer })

    block(column, row - 2)
    block(column, row - 1)
  }

  // A plant in each interior corner for a bit of life.
  const corners: Array<[number, number]> = [
    [1, 1],
    [officeColumns - 2, 1],
    [1, officeRows - 2],
    [officeColumns - 2, officeRows - 2]
  ]

  for (const [column, row] of corners) {
    decor.push({ column, row, index: theme.tiles.plant })
    block(column, row)
  }

  return { floor, decor, blocked }
}
