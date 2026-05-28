import { spawn as spawnProcess, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { buildSharedVoice, type ToolScope, type Villager } from '../../shared/agents'
import { harnessById } from '../../shared/harnesses'
import type { AgentSession, HarnessAdapter, SessionHandlers } from './session-types'
import { streamReply } from './streaming'

type ChatHistoryLine = { from: 'you' | 'agent'; text: string }

function commandExists(command: string): boolean {
  const result = spawnSync(command, ['--version'], { stdio: 'ignore' })

  return result.error === undefined
}

function codexCommand(): string {
  return process.env.CODEX_BIN ?? 'codex'
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

function buildPrompt(villager: Villager, text: string, history: ChatHistoryLine[]): string {
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
    transcript === '' ? '' : `<conversation>\n${transcript}\n</conversation>`,
    `<player_message>\n${text}\n</player_message>`
  ]
    .filter((part) => part !== '')
    .join('\n\n')
}

function isCodexLive(): boolean {
  return commandExists(codexCommand())
}

function createCodexSession(villager: Villager, handlers: SessionHandlers, cwd: string): AgentSession {
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
      'exec',
      '--skip-git-repo-check',
      '--cd',
      cwd,
      '--ask-for-approval',
      'never',
      '--sandbox',
      sandboxForScope(scope),
      '--output-last-message',
      outputPath
    ]

    if (model !== undefined && model.trim() !== '') {
      args.push('--model', model.trim())
    }

    args.push('-')

    const prompt = buildPrompt(villager, text, history)

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

      let reply = ''

      if (existsSync(outputPath)) {
        reply = readFileSync(outputPath, 'utf8').trim()
      }

      if (reply === '') {
        reply = stdout.join('').trim()
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
          inputTokens: 0,
          outputTokens: 0,
          cacheCreateTokens: 0,
          cacheReadTokens: 0,
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
  status: () => {
    const live = isCodexLive()

    return {
      id: 'codex',
      label: harnessById('codex').label,
      live,
      detail: live ? `live via ${codexCommand()}` : 'mock; install or log in to Codex CLI'
    }
  },
  create: createCodexSession
}
