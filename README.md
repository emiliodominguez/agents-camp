# Claude Office

A pixel-art village where Claude Code agents appear as walkable
characters you can stand next to and talk to.

**Status:** walkable medieval-village camp with a working agent backend. Phaser
4 renders a 26×20 world — a grass field crossed by organic dirt roads that wind
in from the edges to a market plaza, with four animated villager agents living
beside their homes. Solid renders the UI overlay, including a proximity chat
panel. A Node + WebSocket backend runs each agent as a Claude Agent SDK session
(or canned mock replies when no API key is set).

## Stack

- **Phaser 4** — tiled world, animated sprites, movement, collision, proximity
- **Solid** — reactive UI overlay (roster, talk prompt, streaming chat panel)
- **Node + ws** — agent backend, one session per villager
- **Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`) — streaming-input
  conversational agents
- **Vite 8 + TypeScript 6**

## Art & themes

The whole look is data-driven and swappable. A `Theme` (`src/themes/`) bundles a
ground tileset, per-agent animated character strips, free-placed object sprites,
and the authored road network. Adding a new theme is a new `Theme` object — no
rendering code changes. The full library of downloaded CraftPix packs lives in
`public/assets/packs/` (see its README) to draw from when extending themes.

Current art: CraftPix "Free Village / Top-Down Defense" tileset (ground, houses,
tents, props) and "Free Pixel Citizens" (the four animated villagers).

## Agents

Each villager is a long-lived agent with a role persona. Stand next to one and
press **E** to open a chat. Messages stream back token by token; the status
bubble over the sprite reflects the agent's live state: ⚙️ working → 💬 talking
→ 💤 idle.

Villagers are **fully capable coding agents** — they each have a private
workspace at `.agents/workspace/<id>/` and can use `Read`, `Write`, `Edit`,
`Glob`, `Grep`, `Bash`, `Skill` (any of your `~/.claude/skills/`), and
`AskUserQuestion` (rendered as clickable option buttons in the chat). Tool
calls appear inline in the transcript.

Walk onto an empty plot (the glowing `+` markers) and press E to **spawn a new
villager** with a custom name, role, and sprite. Chat instructions are editable
from the chat header — saved on the next message.

The roster, transcripts, and personas all persist on disk under `.agents/` and
survive reloads and server restarts.

- **Live:** real Claude replies.
- **Mock:** with no credentials, the backend serves persona-flavoured canned
  replies, so the whole pipeline — WebSocket, streaming, status — works end to
  end (mock mode has no tools).

> ⚠️ Villagers run with `permissionMode: 'bypassPermissions'` — they can read,
> write, edit, and run shell commands without prompting, scoped to their
> workspace directory (`cwd`) but **Bash itself isn't sandboxed**. Treat them
> like Claude Code: only run them on machines / accounts where that's fine.

## Run

```bash
pnpm install
pnpm dev   # web on http://localhost:5180, agent backend on ws://localhost:8787
```

`pnpm dev` runs both the Vite dev server and the agent backend (Vite proxies
`/agents` to it). Walk with **WASD** or the arrow keys; press **E** next to an
agent to talk.

The agents run on real Claude automatically if you're logged in with the Claude
Code CLI (`claude login`) — the SDK reuses that session, no API key needed, and
usage draws from your Claude subscription. The roster panel shows whether agents
are "live (Claude)" or "mock replies".

Other auth options, in precedence order (see `.env.example`):

1. `CLAUDE_CODE_OAUTH_TOKEN` — a subscription token from `claude setup-token`
   (best for deploys without an interactive login).
2. `ANTHROPIC_API_KEY` — a standalone metered API key.
3. Local `claude login` session — zero config on your own machine.

Other scripts: `pnpm dev:web` (web only), `pnpm dev:server` (backend only),
`pnpm build`.

## Next steps

1. Give agents tools and a working directory so they can actually do coding work
   (with a sandbox + permission handling).
2. Spawn / stop agents from an empty plot.
3. Directional walk animations while moving.
