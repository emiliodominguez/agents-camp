# Harnesses

A harness is a runtime that powers a villager. Claude Code and Codex CLI are supported today.

## Shared Registry

Shared harness metadata is in `shared/harnesses/`.

- `types.ts` defines `AgentHarnessId` and `AgentHarnessDefinition`.
- `claude.ts` defines the Claude Code UI metadata.
- `codex.ts` defines the Codex CLI UI metadata.
- `../harnesses.ts` exports the registry, default harness, normalization, and lookup helpers.

The frontend uses this registry for roster filters, spawn choices, chat editing, skill labels, and usage labels.

## Server Adapters

Runtime logic is isolated under `server/harnesses/`.

- `claude-session.ts` owns Claude Agent SDK streaming sessions, auth detection, allowed tool mapping, Claude tool summaries, and AskUserQuestion interception.
- `codex-session.ts` owns Codex CLI turn execution, sandbox mapping, prompt construction, output capture, and streamed final replies.
- `mock-session.ts` owns fallback canned replies when a selected harness is unavailable.
- `session-types.ts` defines the common adapter/session interfaces.
- `streaming.ts` provides shared text streaming helpers.
- `index.ts` registers adapters and chooses live vs mock sessions.

`server/index.ts` imports only from `server/harnesses/index.ts`; it does not know Claude or Codex internals.

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

Live when `codex --version` succeeds, or when `CODEX_BIN` points to an executable that supports the Codex CLI contract.

Codex sessions are turn-based:

1. Build a prompt from persona, shared voice, capability scope, recent transcript, and player message.
2. Run `codex exec` in the villager workspace.
3. Read `--output-last-message`.
4. Stream the final reply back to the UI.

Full-scope Codex villagers use `--sandbox workspace-write --ask-for-approval never`.
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
4. Add `server/harnesses/<id>-session.ts` implementing `HarnessAdapter`.
5. Register the adapter in `server/harnesses/index.ts`.
6. Add any skill roots to `server/skills.ts`.
7. Add env vars to `.env.example`.
8. Update this document and README.
9. Run `pnpm check`.
