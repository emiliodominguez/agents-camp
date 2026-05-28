# Harnesses

A harness is a runtime that powers a villager. Claude Code and Codex CLI are supported today.

## Shared Registry

Shared harness metadata is in `shared/harnesses/`.

- `types.ts` defines `AgentHarnessId` and `AgentHarnessDefinition`.
- `claude.ts` defines the Claude Code UI metadata.
- `codex.ts` defines the Codex CLI UI metadata.
- `../harnesses.ts` exports the registry, default harness, normalization, and lookup helpers.

The frontend uses this registry for roster filters, spawn choices, chat editing, transcript labels, skill labels, and usage labels.

## Server Adapters

Runtime logic is isolated under `server/harnesses/`.

- `claude-session.ts` owns Claude Agent SDK streaming sessions, auth detection, allowed tool mapping, Claude tool summaries, and AskUserQuestion interception.
- `codex-session.ts` owns Codex CLI turn execution, sandbox mapping, prompt construction, output capture, and streamed final replies.
- `handoff.ts` builds compact provider-neutral transcript context for fresh sessions and harness switches.
- `mock-session.ts` owns fallback canned replies when a selected harness is unavailable.
- `session-types.ts` defines the common adapter/session interfaces.
- `streaming.ts` provides shared text streaming helpers.
- `index.ts` registers adapters and chooses live vs mock sessions.

`server/index.ts` imports only from `server/harnesses/index.ts`; it does not know Claude or Codex internals.

## Switching Harnesses

The villager transcript is the canonical conversation record. Harness sessions are runtime-specific and are not moved directly between providers.

When a villager changes harness:

1. The roster updates the villager's `harness`.
2. Any existing live session for that villager is closed.
3. The next message creates a fresh session for the selected harness.
4. `handoff.ts` builds a compact context prompt from the saved transcript and passes it to the adapter.
5. The new harness receives the handoff context plus the current player message.

Committed agent messages, tool calls, questions, and errors store the harness that produced them. The chat UI shows that attribution, so mixed Claude/Codex transcripts stay understandable.

## Current Harnesses

### Claude Code

Live when one of these is available:

- `CLAUDE_CODE_OAUTH_TOKEN`
- `ANTHROPIC_API_KEY`
- local `claude login` credentials

Full-scope Claude villagers use:

- `permissionMode: 'bypassPermissions'`
- `Read`, `Write`, `Edit`, `Glob`, `Grep`, `Bash`, `Skill`, and `AskUserQuestion`

Read-only Claude villagers use `Read`, `Glob`, `Grep`, and `AskUserQuestion`.

### Codex CLI

Live when the Codex CLI is installed and the backend can see Codex auth:

- `codex` on `PATH`, or `CODEX_BIN` pointing to a Codex executable
- `~/.codex/auth.json`, `OPENAI_API_KEY`, or `CODEX_API_KEY`

Use `codex doctor` to verify local auth and connectivity when the UI reports Codex as unavailable.

Codex sessions are turn-based:

1. Build a prompt from persona, shared voice, capability scope, optional handoff context, recent session-local transcript, and player message.
2. Run `codex exec --json` in the villager workspace.
3. Read `--output-last-message`.
4. Parse `turn.completed.usage` so input, output, and cached input tokens update the same usage counters as Claude.
5. Stream the final reply back to the UI.

Full-scope Codex villagers use `codex --ask-for-approval never exec --sandbox workspace-write`.
Read-only and conversational villagers use `--sandbox read-only`.

## Skills

`server/skills.ts` scans harness-specific skill roots:

- Claude project: `.claude/skills`
- Claude user: `~/.claude/skills`
- Codex project: `.codex/skills`
- Codex user: `~/.codex/skills`

Each returned skill is tagged with its harness so the UI can show which runtime can see it.

## Adding A Harness

1. Add the id to `AgentHarnessId` in `shared/harnesses/types.ts`.
2. Add `shared/harnesses/<id>.ts` with UI metadata.
3. Add the definition to `harnessDefinitions` in `shared/harnesses.ts`.
4. Add `server/harnesses/<id>-session.ts` implementing `HarnessAdapter`; consume the `SessionHandoff` prompt where the runtime accepts startup/system context.
5. Register the adapter in `server/harnesses/index.ts`.
6. Add any skill roots to `server/skills.ts`.
7. Add env vars to `.env.example`.
8. Update this document and README.
9. Run `pnpm check`.
