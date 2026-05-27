import type { Theme } from './types'

/**
 * "Pixel Life — Desk Essentials" room art (checkerboard floor, tan office walls,
 * monitors and desks) paired with Kenney's roguelike character sprites until a
 * matching character pack is added. The desk sheet is an 18-column, 16px grid.
 *
 * Tile indices read off the sheet:
 *   floor 48/49 (light/dark checkerboard), wall body 14, wall base 50,
 *   desk surface 0 over legs 18, monitor 43, decor: chart 47, papers 10,
 *   extinguisher 45.
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
    frameSize: 16,
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
    floor: { light: 48, dark: 49 },
    wall: { body: 14, base: 50 },
    workstation: { deskSurface: 0, deskLegs: 18, monitor: 43 },
    decor: [47, 10, 45]
  },
  backgroundColor: '#1a1410'
}
