import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { query, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'

import type { Villager } from '../shared/agents'
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
  /** Something failed. */
  onError: (message: string) => void
}

/** A long-lived conversation with one agent. */
export interface AgentSession {
  /** Send a player message into the conversation. */
  send: (text: string) => void
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
function createLiveSession(villager: Villager, handlers: SessionHandlers, model: string): AgentSession {
  const queue = new MessageQueue()

  async function* prompt(): AsyncGenerator<SDKUserMessage> {
    for await (const text of queue) {
      yield toUserMessage(text)
    }
  }

  const conversation = query({
    prompt: prompt(),
    options: {
      model,
      systemPrompt: villager.persona,
      allowedTools: [],
      permissionMode: 'bypassPermissions',
      includePartialMessages: true,
      settingSources: []
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
        } else if (message.type === 'result') {
          const final = message.subtype === 'success' ? message.result : current
          handlers.onReply(final)
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
export function createSession(villager: Villager, handlers: SessionHandlers): AgentSession {
  if (isLive()) {
    const model = process.env.AGENT_MODEL ?? 'claude-sonnet-4-6'

    return createLiveSession(villager, handlers, model)
  }

  return createMockSession(villager, handlers)
}
