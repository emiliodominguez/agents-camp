import { villageTheme } from './village'
import type { Theme } from './types'

export type { Theme, Placement, ObjectSprite, GroundSpec, SheetSpec, CharacterSpec } from './types'

/** Every theme the scene can render in. */
export const themes: Theme[] = [villageTheme]

/** The theme used on load. Later this can be driven by a picker or storage. */
export const activeTheme: Theme = villageTheme
