import { existsSync } from 'node:fs'

import { villageTheme } from '../src/themes/village'

const paths = new Set<string>()

paths.add(villageTheme.ground.sheet.path)

for (const sprite of Object.values(villageTheme.sprites)) {
  paths.add(sprite.path)
}

for (const character of villageTheme.characters) {
  for (const direction of ['d', 's', 'u'] as const) {
    paths.add(`${character.pathPrefix}/${direction}${character.idle.suffix}.png`)
    paths.add(`${character.pathPrefix}/${direction}${character.walk.suffix}.png`)
  }
}

const missing = [...paths].filter((path) => !existsSync(`public${path}`))

console.log(JSON.stringify({ checked: paths.size, missing }, null, 2))

if (missing.length > 0) {
  process.exit(1)
}
