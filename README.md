# Agents Camp

A pixel-art village where coding agents from different harnesses
appear as walkable characters you can stand next to and talk to.

**Status:** walkable medieval camp with a WebSocket agent backend. Phaser renders
a 26x20 world with CraftPix village/field sprites, roads, homes, fences, camp
props, and animated villagers. Solid renders the roster, spawn dialog, chat
panel, skill list, and usage view.

## Stack

- **Phaser 4** — tiled world, animated sprites, movement, collision, proximity
- **Solid** — reactive UI overlay
- **Node + ws** — agent backend, one session per villager
- **Claude Agent SDK** — persistent Claude Code harness sessions
- **Codex CLI** — turn-based Codex harness sessions
- **Vite 8 + TypeScript 6**

## Harnesses

Each villager has a `harness` field. The shared registry lives in
`shared/harnesses.ts`, with one metadata file per harness under
`shared/harnesses/`. Runtime adapters live under `server/harnesses/`; each
harness owns its own `*-session.ts` file and registers through
`server/harnesses/index.ts`.

Add another harness by adding:

- a shared definition in `shared/harnesses/<id>.ts`
- the id to `shared/harnesses/types.ts`
- a server adapter in `server/harnesses/<id>-session.ts`
- the adapter to `server/harnesses/index.ts`

Currently supported:

- **Claude Code** (`claude`) — live when `CLAUDE_CODE_OAUTH_TOKEN`,
  `ANTHROPIC_API_KEY`, or a local `claude login` session is available. Uses the
  existing streaming Agent SDK path, Claude Code tools, and Claude skills.
- **Codex CLI** (`codex`) — live when the `codex` command is available. Runs
  `codex exec` per turn inside the villager's private workspace. Codex turns
  count in usage; token counts are zero unless the CLI exposes them through a
  future adapter.
- **Mock fallback** — if a villager's chosen harness is unavailable, that
  villager serves canned persona-flavoured replies.

## Agents

Each villager has a role persona, tool-scope, harness, sprite, home, dot colour,
and private workspace at `.agents/workspace/<id>/`. Stand next to one and press
**E** to chat. Messages stream back into the transcript, and the status bubble
tracks idle/working/talking.

Spawned villagers can be configured with:

- Harness: Claude Code or Codex CLI
- Capability scope: conversational, read-only, or full coding
- Persona/instructions and sprite

The roster, transcripts, personas, harness choices, and usage persist under
`.agents/`.

> Agents can run tools in their private workspace. Claude full-scope agents use
> `permissionMode: 'bypassPermissions'`; Codex full-scope agents run with
> `--sandbox workspace-write --ask-for-approval never`. Use live harnesses only
> on machines and accounts where that level of local automation is acceptable.

## Art & Themes

The world is data-driven. A `Theme` in `src/themes/` bundles the ground tileset,
character strips, free-placed object sprites, and authored road network.

Current live art uses CraftPix village assets plus field-pack foliage, fences,
camp props, flags, and campfires. Curated pack extracts live in
`public/assets/packs/`.

## File Layout

Files use kebab-case unless they are conventional entry/config names such as
`index.ts`, `main.ts`, or `*.d.ts`.

- `src/game/` - Phaser scene, character, furnishing, and world constants
- `src/overlay/` - Solid overlay UI and overlay-local state
- `src/services/` - browser service clients
- `src/state/` - shared client signals
- `server/harnesses/` - one runtime adapter per agent harness
- `shared/harnesses/` - shared harness metadata by harness id

## Run

```bash
pnpm install
pnpm dev   # web on http://localhost:5180, backend on ws://localhost:8787
```

`pnpm dev` starts Vite and the backend. Vite proxies `/agents` to the backend.
Walk with **WASD** or arrow keys; press **E** next to a villager or empty plot.

Configuration lives in `.env` (copy from `.env.example`):

- `AGENT_HARNESS=claude|codex` sets the default for new/legacy villagers.
- `CLAUDE_CODE_OAUTH_TOKEN`, `ANTHROPIC_API_KEY`, or local `claude login` enable
  the Claude harness.
- `CLAUDE_AGENT_MODEL` overrides the Claude model.
- `CODEX_BIN` and `CODEX_AGENT_MODEL` configure the Codex harness.
- `AGENT_PORT` changes the backend WebSocket port.

Other scripts: `pnpm dev:web`, `pnpm dev:server`, `pnpm build`.
