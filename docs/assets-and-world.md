# Assets And World

The world uses CraftPix pixel-art assets plus a data-driven theme layer.

## Live Theme

The active theme is `src/themes/village.ts`.

It defines:

- ground sheet and path tile indices
- object sprite keys and footprints
- animated object metadata for flags and campfires
- authored road cells
- deterministic scatter placement
- selectable character specs for the spawn dialog

`src/game/furnish.ts` consumes the theme and produces:

- ground placements
- object placements
- blocked cells for collision

## Public Assets

Live theme assets are copied into stable web paths under `public/assets/themes/village/`.

- `fields.png` is the active ground sheet.
- `objects/house`, `objects/tent`, `objects/box`, `objects/decor`, `objects/grass`, `objects/stone`, and `objects/shadow` come from the village tileset.
- `objects/field/` contains field-pack foliage, fences, camp props, flags, and campfires used by the current world.

Pack extracts live under `public/assets/packs/` and are curated. They are not a full raw archive.

Current retained packs:

- `citizens/` - playable villager sprites
- `village-tileset/` - base world tiles and props
- `fields-tileset/` - field foliage, fences, camp props, and field tiles
- `field-enemies/` - field creature sprites used as spawnable looks
- `archer-towers/` - archer unit sprites used as guard looks

Removed because they did not fit the current camp:

- generated foliage sprites
- old office theme assets
- trap/magic/barricade assets
- free-floating door and tower-placement sprites
- unused enemy pack

## Object Rules

- Decorative tufts, flowers, dirt patches, and pebbles have a `0x0` footprint.
- Trees, bushes, rocks, buildings, fences, and camp props block movement according to their footprint.
- Roads, villager homes, spawn plots, and the player spawn reserve surrounding cells so scatter never blocks core movement.
- Animated objects are horizontal strips and require `ObjectSprite.animation` metadata.

## Validation

Run:

```bash
pnpm check:assets
```

The script checks every path referenced by the active theme and every character strip referenced by the spawn picker.

Run the full project check before committing:

```bash
pnpm check
```
