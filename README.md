# Claude Office

A pixel-art office where Claude Code agents appear as walkable
characters you can stand next to and (soon) talk to.

**Status:** walkable office shell. Phaser 4 renders the room, agent
characters, and a player avatar; Solid renders the UI overlay. No Claude
wiring yet — agents are hard-coded placeholders.

## Stack

- **Phaser 4** — tilemap office, sprites, movement, proximity detection
- **Solid** — reactive UI overlay (roster, interaction prompt) over the canvas
- **Vite 8 + TypeScript 6**

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
