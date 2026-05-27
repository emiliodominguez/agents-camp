import { deskEssentialsTheme } from './desk-essentials'
import type { Theme } from './types'

export type { Theme } from './types'

/** Every theme the office can render in. */
export const themes: Theme[] = [deskEssentialsTheme]

/** The theme used on load. Later this can be driven by a picker or storage. */
export const activeTheme: Theme = deskEssentialsTheme
