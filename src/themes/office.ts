import type { Theme } from './types'

/**
 * The default look: Kenney's CC0 "Roguelike Indoors" tileset for the room and
 * "Roguelike Characters" for the people. Tile indices were read off the
 * tilesheet (27 columns, 16px tiles, 1px margin). Character frames are the
 * pre-composed full-body sprites in the sheet's first two columns.
 *
 * To add another theme, copy this file, point the sheet paths at new artwork,
 * and re-map the indices. Nothing else needs to change.
 */

/** Columns in the character sheet — used to turn (column, row) into an index. */
const characterColumns = 54

/**
 * Build a character frame index from its grid position.
 *
 * @param column - Zero-based column in the character sheet.
 * @param row - Zero-based row in the character sheet.
 * @returns The flat frame index Phaser uses.
 */
function character(column: number, row: number): number {
  return row * characterColumns + column
}

export const officeTheme: Theme = {
  id: 'office',
  name: 'Roguelike Office',
  tileset: {
    path: '/assets/themes/office/tilesheet.png',
    frameSize: 16,
    margin: 1
  },
  characters: {
    path: '/assets/characters/roguelike.png',
    frameSize: 16,
    margin: 1
  },
  characterColumns,
  // Pre-composed bodies live in the first two columns; pick distinct rows.
  characterFrames: [character(0, 0), character(1, 2), character(0, 5), character(1, 7), character(0, 9)],
  tiles: {
    floor: 149,
    wall: 364,
    deskBack: 324,
    deskMiddle: 325,
    deskFront: 326,
    chair: 54,
    computer: 97,
    plant: 16
  },
  rugs: {
    blue: 394,
    green: 448,
    orange: 421
  },
  backgroundColor: '#0b0d12'
}
