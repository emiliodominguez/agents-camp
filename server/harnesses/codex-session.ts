import { spawn as spawnProcess, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

import { buildSharedVoice, type ToolScope, type Villager } from '../../shared/agents'
import { harnessById } from '../../shared/harnesses'
import type { AgentSession, HarnessAdapter, ResultEvent, SessionHandlers, SessionHandoff } from './session-types'
import { streamReply } from './streaming'

type ChatHistoryLine = { from: 'you' | 'agent'; text: string }
type CodexUsage = Omit<ResultEvent, 'turns' | 'durationMs'>

function commandExists(command: string): boolean {
  const result = spawnSync(command, ['--version'], { stdio: 'ignore' })

  return result.error === undefined
}

function codexCommand(): string {
  return process.env.CODEX_BIN ?? 'codex'
}

function codexHome(): string {
  return process.env.CODEX_HOME ?? join(homedir(), '.codex')
}

function codexAuthConfigured(): boolean {
  const apiKey = process.env.OPENAI_API_KEY ?? process.env.CODEX_API_KEY

  return (typeof apiKey === 'string' && apiKey.trim() !== '') || existsSync(join(codexHome(), 'auth.json'))
}

function codexHealth(): ReturnType<HarnessAdapter['status']> {
  const command = codexCommand()

  if (!commandExists(command)) {
    return {
      id: 'codex',
      label: harnessById('codex').label,
      live: false,
      state: 'missing',
      detail: `mock; ${command} is not available`,
      help: [
        'Install Codex CLI, for example with npm install -g @openai/codex.',
        'If Codex is installed somewhere else, set CODEX_BIN to its executable path and restart the backend.'
      ]
    }
  }

  if (!codexAuthConfigured()) {
    return {
      id: 'codex',
      label: harnessById('codex').label,
      live: false,
      state: 'auth-required',
      detail: `mock; ${command} is installed but no Codex auth was found`,
      help: [
        'Run codex login in a terminal, or set OPENAI_API_KEY before starting the backend.',
        'Verify the setup with codex doctor, then restart pnpm dev:server or pnpm dev.'
      ]
    }
  }

  return {
    id: 'codex',
    label: harnessById('codex').label,
    live: true,
    state: 'live',
    detail: `live via ${command}`,
    help: ['Codex CLI is installed and auth was found. Use codex doctor if turns still fail.']
  }
}

function sandboxForScope(scope: ToolScope): 'read-only' | 'workspace-write' {
  return scope === 'full' ? 'workspace-write' : 'read-only'
}

function scopeInstruction(scope: ToolScope): string {
  if (scope === 'conversational') {
    return 'You are conversational only. Do not inspect or modify files unless the player explicitly changes your capabilities.'
  }

  if (scope === 'read-only') {
    return 'You may inspect and search files in your private workspace, but do not modify files or run mutating commands.'
  }

  return 'You may inspect, edit, write, and run commands in your private workspace when it helps the task.'
}

function buildPrompt(villager: Villager, text: string, history: ChatHistoryLine[], handoff: SessionHandoff): string {
  const scope = villager.toolScope ?? 'full'
  const transcript = history
    .slice(-8)
    .map((line) => `${line.from === 'you' ? 'Player' : villager.name}: ${line.text}`)
    .join('\n')

  return [
    villager.persona,
    '',
    buildSharedVoice(scope, 'codex'),
    scopeInstruction(scope),
    'Keep your final reply concise and in character. If you changed files, summarize exactly what changed.',
    handoff.prompt === '' ? '' : `<handoff_context>\n${handoff.prompt}\n</handoff_context>`,
    transcript === '' ? '' : `<conversation>\n${transcript}\n</conversation>`,
    `<player_message>\n${text}\n</player_message>`
  ]
    .filter((part) => part !== '')
    .join('\n\n')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function numberField(record: Record<string, unknown>, key: string): number {
  const value = record[key]

  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function parseUsage(raw: unknown): CodexUsage | undefined {
  if (!isRecord(raw)) {
    return undefined
  }

  const totalInputTokens = numberField(raw, 'input_tokens')
  const cachedInputTokens = numberField(raw, 'cached_input_tokens')

  return {
    // Codex reports cached input as part of input_tokens. Store fresh input and
    // cache reads separately to match the Claude usage buckets.
    inputTokens: Math.max(0, totalInputTokens - cachedInputTokens),
    outputTokens: numberField(raw, 'output_tokens'),
    cacheCreateTokens: 0,
    cacheReadTokens: cachedInputTokens
  }
}

function parseCodexJsonStream(output: string): { reply: string; usage: CodexUsage | undefined } {
  let reply = ''
  let usage: CodexUsage | undefined

  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim()

    if (trimmed === '') {
      continue
    }

    let event: unknown

    try {
      event = JSON.parse(trimmed)
    } catch {
      continue
    }

    if (!isRecord(event)) {
      continue
    }

    if (event.type === 'turn.completed') {
      usage = parseUsage(event.usage)
    } else if (event.type === 'item.completed' && isRecord(event.item)) {
      const item = event.item

      if (item.type === 'agent_message' && typeof item.text === 'string') {
        reply = item.text.trim()
      }
    }
  }

  return { reply, usage }
}

function isCodexLive(): boolean {
  return codexHealth().live
}

function createCodexSession(
  villager: Villager,
  handlers: SessionHandlers,
  cwd: string,
  handoff: SessionHandoff
): AgentSession {
  const history: ChatHistoryLine[] = []
  const pending: string[] = []
  let running = false
  let closed = false
  let child: ChildProcessWithoutNullStreams | undefined

  const runNext = (): void => {
    if (running || closed) {
      return
    }

    const text = pending.shift()

    if (text === undefined) {
      return
    }

    running = true

    void runTurn(text)
      .catch((error: unknown) => {
        handlers.onError(error instanceof Error ? error.message : String(error))
      })
      .finally(() => {
        running = false
        handlers.onStatus('idle')
        runNext()
      })
  }

  const runTurn = async (text: string): Promise<void> => {
    const scope = villager.toolScope ?? 'full'
    const model = process.env.CODEX_AGENT_MODEL
    const tempDir = mkdtempSync(join(tmpdir(), 'agents-camp-codex-'))
    const outputPath = join(tempDir, 'last-message.txt')
    const startedAt = Date.now()
    const args = [
      '--ask-for-approval',
      'never',
      'exec',
      '--json',
      '--skip-git-repo-check',
      '--cd',
      cwd,
      '--sandbox',
      sandboxForScope(scope),
      '--output-last-message',
      outputPath
    ]

    if (model !== undefined && model.trim() !== '') {
      args.push('--model', model.trim())
    }

    args.push('-')

    const prompt = buildPrompt(villager, text, history, handoff)

    history.push({ from: 'you', text })
    handlers.onStatus('working')

    const stdout: string[] = []
    const stderr: string[] = []

    try {
      await new Promise<void>((resolve, reject) => {
        child = spawnProcess(codexCommand(), args, { cwd, env: process.env })

        child.stdout.setEncoding('utf8')
        child.stderr.setEncoding('utf8')
        child.stdout.on('data', (chunk: string) => stdout.push(chunk))
        child.stderr.on('data', (chunk: string) => stderr.push(chunk))
        child.on('error', reject)
        child.on('close', (code) => {
          child = undefined

          if (closed) {
            resolve()

            return
          }

          if (code === 0) {
            resolve()
          } else {
            reject(new Error(stderr.join('').trim() || `Codex exited with code ${code ?? 'unknown'}`))
          }
        })

        child.stdin.end(prompt)
      })

      if (closed) {
        return
      }

      const codexJson = parseCodexJsonStream(stdout.join(''))
      let reply = ''

      if (existsSync(outputPath)) {
        reply = readFileSync(outputPath, 'utf8').trim()
      }

      if (reply === '') {
        reply = codexJson.reply
      }

      if (reply === '') {
        handlers.onError('Codex completed without a final message.')

        return
      }

      history.push({ from: 'agent', text: reply })
      await streamReply(reply, handlers, () => closed)

      if (!closed) {
        handlers.onReply(reply)
        handlers.onResult?.({
          turns: 1,
          inputTokens: codexJson.usage?.inputTokens ?? 0,
          outputTokens: codexJson.usage?.outputTokens ?? 0,
          cacheCreateTokens: codexJson.usage?.cacheCreateTokens ?? 0,
          cacheReadTokens: codexJson.usage?.cacheReadTokens ?? 0,
          durationMs: Date.now() - startedAt
        })
      }
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  }

  return {
    send: (text: string) => {
      pending.push(text)
      runNext()
    },
    answer: () => {
      // Codex CLI turns do not currently emit structured AskUserQuestion events.
    },
    close: () => {
      closed = true
      pending.length = 0
      child?.kill('SIGTERM')
    }
  }
}

export const codexHarness: HarnessAdapter = {
  id: 'codex',
  isLive: isCodexLive,
  status: codexHealth,
  create: createCodexSession
}
