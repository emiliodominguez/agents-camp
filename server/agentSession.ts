import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { query, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'

import { buildSharedVoice, type ToolScope, type Villager } from '../shared/agents'
import type { AgentStatus } from '../shared/protocol'

/**
 * Callbacks an {@link AgentSession} uses to report progress back to whoever
 * owns it (the WebSocket connection handler).
 */
export interface SessionHandlers {
  /** The agent's lifecycle state changed. */
  onStatus: (status: AgentStatus) => void
  /** A chunk of reply text streamed in. */
  onToken: (text: string) => void
  /** The reply finished; `text` is the whole message. */
  onReply: (text: string) => void
  /** The agent called a tool. */
  onTool: (event: { name: string; input: unknown; summary: string }) => void
  /** The agent asked a multi-choice question (AskUserQuestion). */
  onQuestion: (event: AgentQuestionEvent) => void
  /** A turn completed — token counts, turn count, timing for usage stats. */
  onResult?: (event: ResultEvent) => void
  /** Something failed. */
  onError: (message: string) => void
}

/** Per-turn result event for usage tracking. */
export interface ResultEvent {
  /** Number of turns this result spans (always 1 for our use, but echoed). */
  turns: number
  inputTokens: number
  outputTokens: number
  cacheCreateTokens: number
  cacheReadTokens: number
  durationMs: number
}

/** A multi-choice question yielded by the AskUserQuestion tool. */
export interface AgentQuestionEvent {
  toolUseId: string
  question: string
  header?: string
  multiSelect: boolean
  options: Array<{ label: string; description?: string }>
}

/** A long-lived conversation with one agent. */
export interface AgentSession {
  /** Send a player message into the conversation. */
  send: (text: string) => void
  /** Answer an AskUserQuestion-style question with the picked options. */
  answer: (toolUseId: string, picks: string[]) => void
  /** Tear the session down and release resources. */
  close: () => void
}

/**
 * A blocking async queue of player messages. The SDK consumes this as the
 * streaming-input `prompt`; `send` pushes onto it and wakes the consumer.
 */
class MessageQueue {
  private readonly buffer: string[] = []
  private resolve: ((value: string) => void) | undefined
  private closed = false

  /** Push a message, waking any waiting consumer. */
  push(text: string): void {
    if (this.resolve !== undefined) {
      const release = this.resolve
      this.resolve = undefined
      release(text)

      return
    }

    this.buffer.push(text)
  }

  /** Stop the queue; the consumer's iteration ends after draining. */
  close(): void {
    this.closed = true

    if (this.resolve !== undefined) {
      const release = this.resolve
      this.resolve = undefined
      release('')
    }
  }

  /**
   * Async iterator of messages. Yields buffered messages immediately, then
   * waits for the next `push`. Ends when `close` is called.
   *
   * @returns An async generator of message strings.
   */
  async *[Symbol.asyncIterator](): AsyncGenerator<string> {
    while (!this.closed) {
      const next = this.buffer.shift()

      if (next !== undefined) {
        yield next

        continue
      }

      const text = await new Promise<string>((resolve) => {
        this.resolve = resolve
      })

      if (this.closed) {
        return
      }

      yield text
    }
  }
}

/**
 * Map a villager's tool-scope choice to a concrete SDK `allowedTools` list.
 * - conversational: no tools (pure chat).
 * - read-only: can browse files but not change them.
 * - full: every tool, including Bash and Skill (matches Claude Code default).
 *
 * @param scope - The villager's tool scope.
 * @returns The SDK `allowedTools` array.
 */
function toolsForScope(scope: ToolScope): string[] {
  if (scope === 'conversational') {
    return ['AskUserQuestion']
  }

  if (scope === 'read-only') {
    return ['Read', 'Glob', 'Grep', 'AskUserQuestion']
  }

  return ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash', 'Skill', 'AskUserQuestion']
}

/**
 * Brief one-line summary of a tool call, suitable for compact chat display.
 *
 * @param name - Tool name.
 * @param input - Tool input as an object.
 * @returns A short human-readable summary.
 */
function summariseTool(name: string, input: Record<string, unknown>): string {
  const path = typeof input.file_path === 'string' ? input.file_path : undefined
  const pattern = typeof input.pattern === 'string' ? input.pattern : undefined
  const command = typeof input.command === 'string' ? input.command : undefined
  const skillName = typeof input.skill === 'string' ? input.skill : undefined

  switch (name) {
    case 'Read':
      return path !== undefined ? `Read ${path}` : 'Read a file'
    case 'Write':
      return path !== undefined ? `Wrote ${path}` : 'Wrote a file'
    case 'Edit':
      return path !== undefined ? `Edited ${path}` : 'Edited a file'
    case 'Glob':
      return pattern !== undefined ? `Glob ${pattern}` : 'Searched files'
    case 'Grep':
      return pattern !== undefined ? `Grep ${pattern}` : 'Searched text'
    case 'Bash':
      return command !== undefined ? `Ran: ${command.length > 60 ? command.slice(0, 60) + '…' : command}` : 'Ran a command'
    case 'Skill':
      return skillName !== undefined ? `Invoked /${skillName}` : 'Invoked a skill'
    default:
      return name
  }
}

/**
 * Wrap a player-message string as the SDK's user-message shape.
 *
 * @param text - The player's message.
 * @returns A streaming-input user message.
 */
function toUserMessage(text: string): SDKUserMessage {
  return {
    type: 'user',
    message: { role: 'user', content: text },
    parent_tool_use_id: null
  }
}

/**
 * A real agent session backed by the Claude Agent SDK in streaming-input mode.
 * One persistent `query()` consumes a queue of player messages and reports
 * status, streamed tokens, and final replies through the handlers.
 *
 * @param villager - The villager's identity and system prompt.
 * @param handlers - Progress callbacks.
 * @param model - Claude model id to use.
 * @returns The live session.
 */
function createLiveSession(villager: Villager, handlers: SessionHandlers, model: string, cwd: string): AgentSession {
  const queue = new MessageQueue()
  /** Pending question answers — toolUseId → resolver awaited by canUseTool. */
  const pendingAnswers = new Map<string, (picks: string[]) => void>()

  async function* prompt(): AsyncGenerator<SDKUserMessage> {
    for await (const text of queue) {
      yield toUserMessage(text)
    }
  }

  const conversation = query({
    prompt: prompt(),
    options: {
      model,
      systemPrompt: `${villager.persona}\n\n${buildSharedVoice(villager.toolScope ?? 'full')}`,
      cwd,
      allowedTools: toolsForScope(villager.toolScope ?? 'full'),
      permissionMode: 'bypassPermissions',
      includePartialMessages: true,
      // Load user and project skills (~/.claude/skills and .claude/skills) so
      // the villager can invoke them via the Skill tool.
      settingSources: ['user', 'project'],
      // Intercept AskUserQuestion: emit it to the chat UI and wait for the
      // player's pick. Returning behavior:'deny' with a JSON message gives the
      // model a structured tool result without us having to run the built-in
      // tool ourselves (which would need a TUI).
      canUseTool: async (toolName, input) => {
        if (toolName !== 'AskUserQuestion') {
          return { behavior: 'allow', updatedInput: input }
        }

        const questions = Array.isArray((input as { questions?: unknown }).questions)
          ? ((input as { questions: Array<Record<string, unknown>> }).questions ?? [])
          : []
        const first = questions[0]

        if (first === undefined) {
          return { behavior: 'allow', updatedInput: input }
        }

        const toolUseId = `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        const options = Array.isArray(first.options)
          ? (first.options as Array<Record<string, unknown>>).map((option) => ({
              label: String(option.label ?? ''),
              description: typeof option.description === 'string' ? option.description : undefined
            }))
          : []

        handlers.onQuestion({
          toolUseId,
          question: String(first.question ?? ''),
          header: typeof first.header === 'string' ? first.header : undefined,
          multiSelect: Boolean(first.multiSelect),
          options
        })

        const picks = await new Promise<string[]>((resolve) => {
          pendingAnswers.set(toolUseId, resolve)
        })

        // Return the picks as a synthetic tool error message — Claude reads
        // this as the AskUserQuestion result.
        return {
          behavior: 'deny',
          message: JSON.stringify({ answers: picks })
        }
      }
    }
  })

  // Consume the agent's output stream for the session's whole lifetime.
  void (async () => {
    let current = ''

    try {
      for await (const message of conversation) {
        if (message.type === 'stream_event') {
          const event = message.event

          if (event.type === 'message_start') {
            current = ''
            handlers.onStatus('working')
          } else if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            current += event.delta.text
            handlers.onStatus('talking')
            handlers.onToken(event.delta.text)
          }
        } else if (message.type === 'assistant') {
          // Surface tool-use blocks as they arrive so the UI can show what the
          // villager is doing (reading, editing, running commands, calling skills).
          const content = message.message?.content ?? []

          for (const raw of content) {
            const block = raw as { type?: string; name?: unknown; input?: unknown }

            if (block.type === 'tool_use' && typeof block.name === 'string' && block.name !== 'AskUserQuestion') {
              const input = (block.input ?? {}) as Record<string, unknown>
              const summary = summariseTool(block.name, input)
              handlers.onTool({ name: block.name, input, summary })
            }
          }
        } else if (message.type === 'result') {
          const final = message.subtype === 'success' ? message.result : current
          handlers.onReply(final)

          if (message.subtype === 'success') {
            const usage = message.usage
            handlers.onResult?.({
              turns: message.num_turns,
              inputTokens: usage.input_tokens ?? 0,
              outputTokens: usage.output_tokens ?? 0,
              cacheCreateTokens: usage.cache_creation_input_tokens ?? 0,
              cacheReadTokens: usage.cache_read_input_tokens ?? 0,
              durationMs: message.duration_ms
            })
          }

          handlers.onStatus('idle')
        }
      }
    } catch (error) {
      handlers.onError(error instanceof Error ? error.message : String(error))
      handlers.onStatus('idle')
    }
  })()

  return {
    send: (text: string) => {
      handlers.onStatus('working')
      queue.push(text)
    },
    answer: (toolUseId: string, picks: string[]) => {
      const resolver = pendingAnswers.get(toolUseId)

      if (resolver !== undefined) {
        pendingAnswers.delete(toolUseId)
        resolver(picks)
      }
    },
    close: () => {
      queue.close()
      void conversation.interrupt?.()
    }
  }
}

/** Canned, persona-flavoured replies used when no API key is configured. */
const mockReplies: Record<string, string[]> = {
  planner: [
    "Let's break that into steps before we touch anything.",
    'Good question — first, what outcome are we aiming for?',
    "I'd sketch the plan, then hand it to Builder."
  ],
  builder: [
    "On it — I'd wire that up straight away.",
    'Easy enough. Point me at the file and I can picture the change.',
    "Let's just build the simplest version first."
  ],
  reviewer: [
    "Hmm, have we thought about the edge cases there?",
    "It might work, but I'd want a second look before we ship it.",
    'Looks alright — though I have a couple of nits.'
  ],
  explorer: [
    'Ooh, interesting — what happens if we dig a little deeper?',
    "I haven't seen that corner of the camp yet. Let's find out!",
    "Curious. I'd poke at it and see what turns up."
  ]
}

/**
 * A mock session that streams a canned, persona-appropriate reply token by
 * token, so the whole pipeline works without an API key. Mirrors the live
 * session's status/token/reply sequence and timing.
 *
 * @param villager - The villager's identity.
 * @param handlers - Progress callbacks.
 * @returns The mock session.
 */
function createMockSession(villager: Villager, handlers: SessionHandlers): AgentSession {
  const pool = mockReplies[villager.id] ?? [`Hello — I'm ${villager.name}.`, 'Tell me more.', "I'm thinking it over."]
  let turn = 0
  const timers = new Set<ReturnType<typeof setTimeout>>()
  let closed = false

  const wait = (ms: number): Promise<void> =>
    new Promise((resolve) => {
      const timer = setTimeout(() => {
        timers.delete(timer)
        resolve()
      }, ms)
      timers.add(timer)
    })

  return {
    send: (_text: string) => {
      const reply = pool[turn % pool.length] ?? '…'
      turn += 1

      void (async () => {
        handlers.onStatus('working')
        await wait(450)

        if (closed) {
          return
        }

        handlers.onStatus('talking')

        // Stream the reply word by word.
        const words = reply.split(' ')

        for (let index = 0; index < words.length; index += 1) {
          if (closed) {
            return
          }

          const piece = (index === 0 ? '' : ' ') + words[index]
          handlers.onToken(piece)
          await wait(70)
        }

        handlers.onReply(reply)
        handlers.onStatus('idle')
      })()
    },
    answer: () => {
      // Mock sessions never ask questions.
    },
    close: () => {
      closed = true

      for (const timer of timers) {
        clearTimeout(timer)
      }

      timers.clear()
    }
  }
}

/**
 * Path to the local Claude Code login credentials, honouring `CLAUDE_CONFIG_DIR`.
 *
 * @returns The credentials file path.
 */
function localCredentialsPath(): string {
  const base = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude')

  return join(base, '.credentials.json')
}

/**
 * How the backend will reach Claude. Read lazily (not at module load) so the
 * server can load a `.env` file first. Three live paths, in precedence order:
 *
 * - `subscription-token`: a `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token`
 *   (runs on your Claude plan, no metered key) — best for deploys.
 * - `api-key`: a standalone `ANTHROPIC_API_KEY` (metered).
 * - `local-login`: the SDK silently reuses your local `claude login` session
 *   (`~/.claude/.credentials.json`) — zero config on your own machine.
 *
 * Otherwise `mock`.
 *
 * @returns The active auth mode.
 */
export function authMode(): 'subscription-token' | 'api-key' | 'local-login' | 'mock' {
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN) {
    return 'subscription-token'
  }

  if (process.env.ANTHROPIC_API_KEY) {
    return 'api-key'
  }

  if (existsSync(localCredentialsPath())) {
    return 'local-login'
  }

  return 'mock'
}

/**
 * Whether real Claude credentials are available (any non-mock auth mode).
 *
 * @returns True when the backend can reach real Claude.
 */
export function isLive(): boolean {
  return authMode() !== 'mock'
}

/**
 * Create an agent session, choosing the live SDK implementation when an API
 * key is present and the mock otherwise.
 *
 * @param villager - The villager's identity and persona.
 * @param handlers - Progress callbacks.
 * @returns A new session.
 */
export function createSession(villager: Villager, handlers: SessionHandlers, cwd: string): AgentSession {
  if (isLive()) {
    const model = process.env.AGENT_MODEL ?? 'claude-sonnet-4-6'

    return createLiveSession(villager, handlers, model, cwd)
  }

  return createMockSession(villager, handlers)
}
