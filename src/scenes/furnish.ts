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
 * Compose the office from a theme: a floor fill, a perimeter wall with a door,
 * one fully-dressed workstation per agent (desk + monitor + a small prop above
 * the agent's chair), and decor scattered along the walls so the room reads as
 * a real, populated office rather than desks floating in empty space. Walls,
 * desks, and wall props are impassable.
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

  const { floor: floorTile, wall, door, workstation, decor: decorTiles } = theme.tiles

  // Floor across the whole room.
  for (let row = 0; row < officeRows; row += 1) {
    for (let column = 0; column < officeColumns; column += 1) {
      floor.push({ column, row, index: floorTile })
    }
  }

  // Perimeter wall, with a door centred in the top edge. The door cell stays
  // walkable (it's the way in/out).
  const doorColumn = Math.floor(officeColumns / 2)

  for (let row = 0; row < officeRows; row += 1) {
    for (let column = 0; column < officeColumns; column += 1) {
      const onEdge = row === 0 || column === 0 || row === officeRows - 1 || column === officeColumns - 1

      if (!onEdge) {
        continue
      }

      if (row === 0 && column === doorColumn) {
        decor.push({ column, row, index: door })
        continue
      }

      decor.push({ column, row, index: wall })
      block(column, row)
    }
  }

  // Wall-hugging decor along the back wall, skipping the door.
  decorTiles.forEach((index, position) => {
    const column = 2 + position * 4

    if (column === doorColumn) {
      return
    }

    decor.push({ column, row: 1, index })
    block(column, 1)
  })

  // Potted-plant-style props in the lower corners to anchor the empty floor.
  const cornerProps = workstation.deskProps

  const corners: Array<[number, number, number]> = [
    [2, officeRows - 2, cornerProps[0] ?? wall],
    [officeColumns - 3, officeRows - 2, cornerProps[1] ?? wall]
  ]

  for (const [column, row, index] of corners) {
    decor.push({ column, row, index })
    block(column, row)
  }

  // One fully-dressed workstation per agent. `tile` is the chair the agent sits
  // at; the desk, monitor, and a rotating small prop sit one row above.
  agents.forEach((agent, position) => {
    const { column, row } = agent.tile
    const deskRow = row - 1

    decor.push({ column, row: deskRow, index: workstation.desk })
    decor.push({ column, row: deskRow, index: workstation.monitor })

    const prop = workstation.deskProps[position % workstation.deskProps.length]

    if (prop !== undefined) {
      decor.push({ column, row: deskRow, index: prop })
    }

    block(column, deskRow)
  })

  return { floor, decor, blocked }
}
