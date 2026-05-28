# Architecture

Agents Camp is a browser game plus a local WebSocket backend.

## Runtime Shape

- `src/main.ts` starts Phaser and mounts the Solid overlay.
- `src/game/` owns the playable world:
  - `world.ts` defines grid size, spawn points, seed villagers, and tile helpers.
  - `village-scene.ts` loads theme assets, draws the world, moves the player, and syncs live villagers from the backend.
  - `character.ts` wraps a Phaser animated sprite, label, and status bubble.
  - `furnish.ts` turns a theme into ground, object placements, and blocked cells.
- `src/overlay/` owns the Solid UI:
  - `overlay.tsx` renders roster, harness controls, chat, spawn dialog, skills, and usage.
  - `state.ts` bridges game state and UI state.
- `src/services/agent-client.ts` owns the browser WebSocket connection.
- `server/index.ts` owns backend WebSocket routing, persistence, sessions, and broadcast messages.
- `shared/` owns types and registries used by both browser and backend.

## Data Flow

1. The browser connects to `/agents`.
2. The backend sends `hello`, `roster`, `skills`, and `usage`.
3. The browser mirrors roster and status in Solid signals.
4. Phaser listens for roster changes and adds/removes character sprites.
5. Chat messages go browser -> backend -> selected harness adapter.
6. Harness adapters stream status, tokens, tools, questions, replies, and usage back through `ServerMessage`.
7. Chat transcripts, roster, usage, and per-agent workspaces persist under `.agents/`.

## Persistence

`.agents/` is runtime state and is ignored by git.

- `.agents/villagers.json` stores the roster.
- `.agents/transcripts/<id>.json` stores chat history.
- `.agents/usage.json` stores cumulative usage.
- `.agents/workspace/<id>/` is each villager's private working directory.

## Naming

Project source files use kebab-case unless they are conventional entry/config names:

- allowed conventional names: `index.ts`, `main.ts`, `*.d.ts`
- examples: `agent-client.ts`, `village-scene.ts`, `claude-session.ts`

Keep folders organized by context before technology. For example, game files live in `src/game/`, while harness runtime files live in `server/harnesses/`.
