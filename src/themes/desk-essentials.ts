import type { Theme } from './types'

/**
 * "Pixel Life — Office Essentials" room art (checkerboard stone floor, tan
 * office walls, monitors and desks) paired with Kenney's roguelike character
 * sprites until a matching character pack is added. The sheet is a 9-column,
 * 32px grid (each asset is one full 32px tile).
 *
 * Tile indices read off the sheet:
 *   desk 0, wall 7, door 8, monitor 12, chart 14, floor 15;
 *   decor: chart 14, papers 5, extinguisher 13.
 */

const characterColumns = 54

/**
 * Build a character frame index from its grid position in the Kenney sheet.
 *
 * @param column - Zero-based column.
 * @param row - Zero-based row.
 * @returns The flat frame index.
 */
function character(column: number, row: number): number {
  return row * characterColumns + column
}

export const deskEssentialsTheme: Theme = {
  id: 'desk-essentials',
  name: 'Desk Essentials',
  tileset: {
    path: '/assets/themes/office/desk-essentials.png',
    frameSize: 32,
    margin: 0
  },
  characters: {
    path: '/assets/characters/roguelike.png',
    frameSize: 16,
    margin: 1
  },
  characterColumns,
  characterFrames: [character(0, 0), character(1, 2), character(0, 5), character(1, 7), character(0, 9)],
  tiles: {
    floor: 15,
    wall: 7,
    door: 8,
    workstation: { desk: 0, monitor: 12, deskProps: [4, 9, 1, 2] },
    decor: [14, 5, 13]
  },
  backgroundColor: '#1a1410'
}
