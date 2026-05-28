# Development

## Setup

```bash
pnpm install
cp .env.example .env
```

Configure at least one live harness, or the app will use mock replies for unavailable harnesses.

## Run

```bash
pnpm dev
```

This starts:

- Vite web server on `http://localhost:5180`
- WebSocket backend on `ws://localhost:8787/agents`

Useful alternatives:

- `pnpm dev:web` - Vite only
- `pnpm dev:server` - backend with watch mode
- `pnpm server` - backend without watch mode

## Checks

```bash
pnpm check
```

This runs:

1. `pnpm build` - frontend TypeScript and Vite production build
2. `pnpm exec tsc -p tsconfig.server.json` - backend/shared TypeScript
3. `pnpm check:assets` - active theme asset path audit

Run `git diff --check` before commit if edits include manual whitespace changes.

## Runtime State

The backend writes state under `.agents/`, which is ignored by git.

Delete `.agents/` to reset local roster, transcripts, usage, and villager workspaces.

## Environment

See `.env.example` for all supported options.

Important defaults:

- `AGENT_HARNESS=claude`
- `AGENT_PORT=8787`
- `CODEX_BIN=codex`
- `CLAUDE_AGENT_MODEL=claude-sonnet-4-6`

## Commit Hygiene

- Keep source filenames kebab-case, except conventional entry/config names.
- Keep harness-specific runtime logic in its own `server/harnesses/<id>-session.ts`.
- Keep shared harness metadata in `shared/harnesses/<id>.ts`.
- Keep generated/runtime files out of git.
- Use `public/assets/packs/README.md` when adding or removing curated pack extracts.
