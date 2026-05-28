import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { query, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'

import { buildSharedVoice, type ToolScope, type Villager } from '../../shared/agents'
import { harnessById } from '../../shared/harnesses'
import type { AgentSession, HarnessAdapter, SessionHandlers } from './session-types'

/** Claude auth source detected by the backend. */
export type ClaudeAuthMode = 'subscription-token' | 'api-key' | 'local-login' | 'mock'

/** A blocking async queue of player messages for the Claude SDK streaming prompt. */
class MessageQueue {
  private readonly buffer: string[] = []
  private resolve: ((value: string) => void) | undefined
  private closed = false

  push(text: string): void {
    if (this.resolve !== undefined) {
      const release = this.resolve
      this.resolve = undefined
      release(text)

      return
    }

    this.buffer.push(text)
  }

  close(): void {
    this.closed = true

    if (this.resolve !== undefined) {
      const release = this.resolve
      this.resolve = undefined
      release('')
    }
  }

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

function toolsForScope(scope: ToolScope): string[] {
  if (scope === 'conversational') {
    return ['AskUserQuestion']
  }

  if (scope === 'read-only') {
    return ['Read', 'Glob', 'Grep', 'AskUserQuestion']
  }

  return ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash', 'Skill', 'AskUserQuestion']
}

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
      return command !== undefined ? `Ran: ${command.length > 60 ? command.slice(0, 60) + '...' : command}` : 'Ran a command'
    case 'Skill':
      return skillName !== undefined ? `Invoked /${skillName}` : 'Invoked a skill'
    default:
      return name
  }
}

function toUserMessage(text: string): SDKUserMessage {
  return {
    type: 'user',
    message: { role: 'user', content: text },
    parent_tool_use_id: null
  }
}

function localCredentialsPath(): string {
  const base = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude')

  return join(base, '.credentials.json')
}

export function claudeAuthMode(): ClaudeAuthMode {
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

function isClaudeLive(): boolean {
  return claudeAuthMode() !== 'mock'
}

function createClaudeSession(villager: Villager, handlers: SessionHandlers, cwd: string): AgentSession {
  const model = process.env.CLAUDE_AGENT_MODEL ?? process.env.AGENT_MODEL ?? 'claude-sonnet-4-6'
  const queue = new MessageQueue()
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
      systemPrompt: `${villager.persona}\n\n${buildSharedVoice(villager.toolScope ?? 'full', 'claude')}`,
      cwd,
      allowedTools: toolsForScope(villager.toolScope ?? 'full'),
      permissionMode: 'bypassPermissions',
      includePartialMessages: true,
      settingSources: ['user', 'project'],
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

        return {
          behavior: 'deny',
          message: JSON.stringify({ answers: picks })
        }
      }
    }
  })

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
          const content = message.message?.content ?? []

          for (const raw of content) {
            const block = raw as { type?: string; name?: unknown; input?: unknown }

            if (block.type === 'tool_use' && typeof block.name === 'string' && block.name !== 'AskUserQuestion') {
              const input = (block.input ?? {}) as Record<string, unknown>
              handlers.onTool({ name: block.name, input, summary: summariseTool(block.name, input) })
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

export const claudeHarness: HarnessAdapter = {
  id: 'claude',
  isLive: isClaudeLive,
  status: () => {
    const descriptions: Record<ClaudeAuthMode, string> = {
      'subscription-token': 'live via Claude subscription token',
      'api-key': 'live via Anthropic API key',
      'local-login': 'live via local Claude Code login',
      mock: 'mock; run `claude login` or set CLAUDE_CODE_OAUTH_TOKEN'
    }

    return {
      id: 'claude',
      label: harnessById('claude').label,
      live: isClaudeLive(),
      detail: descriptions[claudeAuthMode()]
    }
  },
  create: createClaudeSession
}
