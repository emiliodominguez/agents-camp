# Asset packs

CraftPix CC0-style "free" pixel-art pack extracts, kept only when they support
the current camp or likely agent visuals. Folder names are lowercased and
de-numbered, and each retained pack keeps its `LICENSE.txt`. See each pack's
licence for the exact terms — CraftPix "Free" assets are free for personal and
commercial use; redistribution of the raw assets as an asset pack is not allowed.

Source: https://craftpix.net

| Folder             | Pack                                   | Contents                                                                 |
| ------------------ | -------------------------------------- | ------------------------------------------------------------------------ |
| `citizens/`        | Free Pixel Citizens (865357)           | 4 villagers, dirs D/S/U, each Idle/Walk/Special. **In use** for agents.   |
| `village-tileset/` | Free Village Tileset (504452)          | Ground tiles and objects (house/tent/box/decor/grass/stone). **In use** for the world. |
| `fields-tileset/`  | Free Fields Tileset (665131)           | Ground tiles, field foliage, fences, camp objects, flags, campfires. **Foliage/camp props are in use** in the world. |
| `field-enemies/`   | Free Field Enemies (255707)            | 4 enemies, dirs D/S/U, Walk/Death/Special.                               |
| `archer-towers/`   | Free Archer Towers (658475)            | Tower upgrade + idle frames, 3 archer units (Attack/Idle/Preattack), arrows. |

## Sprite-strip conventions

- **Characters** (citizens, field creatures, archers): one strip per direction +
  animation, frames laid out left-to-right. Direction prefixes: `d_` (down /
  front), `s_` (side), `u_` (up / back). Frame size is square; count = strip
  width / height.
- **Village tiles**: 32×32. `tiles-fields/` is the grass↔dirt field set
  (`fieldstile_NN`); `tiles-planks/` is the wood fence/plank set (`tile2_NN`);
  `tilesheets/` holds the combined atlas sheets.
- **Objects**: individual native-size PNGs, anchored bottom-centre when placed.
  Horizontal object strips can also be loaded as looping animations when the
  theme supplies frame metadata.

## Currently wired in

The live theme (`src/themes/village.ts`) loads citizens from
`/assets/packs/citizens/` and in-use world art from
`/assets/themes/village/`. The field foliage and camp sprites copied from pack
665131 live under
`/assets/themes/village/objects/field/`.
