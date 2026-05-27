# Claude Office

A pixel-art office where Claude Code agents appear as walkable
characters you can stand next to and (soon) talk to.

**Status:** furnished, walkable office. Phaser 4 renders a tiled room with
real pixel-art furniture (desks, computers, chairs, rugs, plants), animated
character sprites at their workstations, walls and desks you collide with, and
a player avatar. Solid renders the UI overlay. No Claude wiring yet — agents
are hard-coded placeholders.

## Stack

- **Phaser 4** — tilemap office, sprites, movement, collision, proximity
- **Solid** — reactive UI overlay (roster, interaction prompt) over the canvas
- **Vite 8 + TypeScript 6**

## Art & themes

The whole look is data-driven and swappable. A `Theme` (`src/themes/`) bundles
a tileset, a character sheet, and the index map saying which tile plays which
role (floor, wall, desk, chair, computer, plant, rugs). Adding a new theme is a
new `Theme` object — no rendering code changes. `activeTheme` selects the
current one.

Current art:

- **Pixel Life — Desk Essentials** — the room (checkerboard floor, office
  walls, monitors and desks)
- [Kenney Roguelike Characters](https://kenney.nl/assets/roguelike-characters)
  (CC0) — the people, until a matching character pack is added

## Run

```bash
pnpm install
pnpm dev   # http://localhost:5180
```

Walk with **WASD** or the arrow keys. Stand next to an agent to surface the
talk prompt.

## Next steps

1. Backend (Node + WebSocket) wired to the Claude Agent SDK — one session per
   character, streaming status into each sprite.
2. Proximity chat: press E to open a chat panel bound to that agent's session.
3. Spawn / stop agents from an empty desk.
