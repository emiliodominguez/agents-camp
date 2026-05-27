# Asset packs

CraftPix CC0-style "free" pixel-art packs, stored in full for use across themes
and future agent visuals. Each pack keeps its original folder structure (folder
names lowercased and de-numbered) and its `LICENSE.txt`. See each pack's licence
for the exact terms — CraftPix "Free" assets are free for personal and
commercial use; redistribution of the raw assets as an asset pack is not allowed.

Source: https://craftpix.net

| Folder             | Pack                                   | Contents                                                                 |
| ------------------ | -------------------------------------- | ------------------------------------------------------------------------ |
| `citizens/`        | Free Pixel Citizens (865357)           | 4 villagers, dirs D/S/U, each Idle/Walk/Special. **In use** for agents.   |
| `village-tileset/` | Free Village Tileset (504452)          | Ground tiles, plank tiles, objects (house/tent/box/decor/grass/stone), animated objects. **In use** for the world. |
| `enemies/`         | Free Enemy Pixel Pack (221601)         | 3 enemies, dirs D/S/U, Attack/Death/Run/Special.                          |
| `field-enemies/`   | Free Field Enemies (255707)            | 4 enemies, dirs D/S/U, Walk/Death/Special.                               |
| `archer-towers/`   | Free Archer Towers (658475)            | Tower upgrade + idle frames, 3 archer units (Attack/Idle/Preattack), arrows. |
| `magic-and-traps/` | Free Magic and Traps (805745)          | Spikes, barricades (+ archer), lightning, exploding barrels.             |

## Sprite-strip conventions

- **Characters** (citizens, enemies, archers): one strip per direction +
  animation, frames laid out left-to-right. Direction prefixes: `d_` (down /
  front), `s_` (side), `u_` (up / back). Frame size is square; count = strip
  width / height.
- **Village tiles**: 32×32. `tiles-fields/` is the grass↔dirt field set
  (`fieldstile_NN`); `tiles-planks/` is the wood fence/plank set (`tile2_NN`);
  `tilesheets/` holds the combined atlas sheets.
- **Objects**: individual native-size PNGs, anchored bottom-centre when placed.

## Currently wired in

The live theme (`src/themes/village.ts`) loads citizens from
`assets/characters/citizens/` and the village art from
`assets/themes/village/` — those copies are the in-use subset. This `packs/`
folder is the full archive to draw from when extending themes or adding enemy /
archer / trap visuals.
