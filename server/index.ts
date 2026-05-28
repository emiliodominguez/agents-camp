import { createServer } from 'node:http'

import { WebSocketServer, type WebSocket } from 'ws'

import { sharedVoice, type Villager } from '../shared/agents'
import type { ChatLine, ClientMessage, ServerMessage } from '../shared/protocol'
import { authMode, createSession, isLive, type AgentSession } from './agentSession'
import {
  appendTranscriptLine,
  deleteTranscript,
  describeStorage,
  loadRoster,
  loadTranscript,
  saveRoster
} from './storage'

// Load a local .env (for CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY) if
// present; harmless if absent.
try {
  process.loadEnvFile()
} catch {
  // No .env file — run on the local Claude login or in mock mode.
}

const port = Number(process.env.AGENT_PORT ?? 8787)

const httpServer = createServer((request, response) => {
  if (request.url === '/health') {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ ok: true, live: isLive(), villagers: roster.length }))

    return
  }

  response.writeHead(426)
  response.end('Upgrade required')
})

const webSocketServer = new WebSocketServer({ server: httpServer, path: '/agents' })

/** The current roster, loaded once on boot; saves on every mutation. */
let roster: Villager[] = loadRoster()

/** The id of every default-seeded villager, which cannot be removed. */
const seededIds = new Set(roster.map((villager) => villager.id))

/** Every connected socket, so roster broadcasts reach all open tabs. */
const sockets = new Set<WebSocket>()

/**
 * Send a typed server message over a socket if it is still open.
 *
 * @param socket - The client socket.
 * @param message - The message to send.
 */
function send(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(message))
  }
}

/** Broadcast a typed message to every connected client. */
function broadcast(message: ServerMessage): void {
  for (const socket of sockets) {
    send(socket, message)
  }
}

/**
 * Slugify a free-form name into an id (`Test Villager` → `test-villager`),
 * appending `-N` until it is unique within the roster.
 *
 * @param name - The villager's display name.
 * @returns A unique id.
 */
function makeId(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

  if (base === '') {
    return `villager-${Date.now()}`
  }

  let candidate = base
  let suffix = 2

  while (roster.some((villager) => villager.id === candidate)) {
    candidate = `${base}-${suffix}`
    suffix += 1
  }

  return candidate
}

/** Pick a pleasant default dot colour from a small palette. */
function pickDotColor(): string {
  const palette = ['#7c9cff', '#6bd6a4', '#f0a868', '#d58cf0', '#f08c8c', '#a3d97c', '#7cd6f0', '#f0d57c']

  return palette[roster.length % palette.length] ?? '#7c9cff'
}

webSocketServer.on('connection', (socket) => {
  sockets.add(socket)

  // Each connection owns its own per-villager sessions so tabs don't share
  // streaming state. The roster itself is shared (server-owned).
  const sessions = new Map<string, AgentSession>()

  /**
   * Lazily create (and cache) the session for a villager, wiring its callbacks
   * to this socket and persisting every committed line.
   *
   * @param agentId - The villager to get a session for.
   * @returns The session, or undefined if the agent id is unknown.
   */
  const sessionFor = (agentId: string): AgentSession | undefined => {
    const existing = sessions.get(agentId)

    if (existing !== undefined) {
      return existing
    }

    const villager = roster.find((v) => v.id === agentId)

    if (villager === undefined) {
      return undefined
    }

    const session = createSession(villager, {
      onStatus: (status) => send(socket, { type: 'status', agentId, status }),
      onToken: (text) => send(socket, { type: 'token', agentId, text }),
      onReply: (text) => {
        const line: ChatLine = { from: 'agent', text, at: Date.now() }
        appendTranscriptLine(agentId, line)
        send(socket, { type: 'reply', agentId, text })
      },
      onError: (message) => send(socket, { type: 'error', agentId, message })
    })

    sessions.set(agentId, session)

    return session
  }

  send(socket, { type: 'hello', live: isLive() })
  send(socket, { type: 'roster', villagers: roster })

  socket.on('message', (raw) => {
    let parsed: ClientMessage

    try {
      parsed = JSON.parse(raw.toString()) as ClientMessage
    } catch {
      return
    }

    if (parsed.type === 'chat') {
      if (typeof parsed.text !== 'string' || parsed.text.trim() === '') {
        return
      }

      const session = sessionFor(parsed.agentId)

      if (session === undefined) {
        send(socket, { type: 'error', agentId: parsed.agentId, message: 'Unknown villager' })

        return
      }

      // Persist the player line before kicking off the reply, so transcripts
      // are always faithful even if the reply errors.
      appendTranscriptLine(parsed.agentId, { from: 'you', text: parsed.text, at: Date.now() })
      session.send(parsed.text)
    } else if (parsed.type === 'history') {
      send(socket, { type: 'history', agentId: parsed.agentId, lines: loadTranscript(parsed.agentId) })
    } else if (parsed.type === 'spawn') {
      const name = (parsed.name ?? '').trim()
      const personaText = (parsed.persona ?? '').trim()

      if (name === '' || personaText === '') {
        send(socket, { type: 'error', agentId: '', message: 'Name and persona are required' })

        return
      }

      const id = makeId(name)
      const villager: Villager = {
        id,
        name,
        tile: parsed.tile,
        sprite: parsed.sprite,
        dotColor: pickDotColor(),
        // New villagers get a tent so spawning is light-weight.
        structure: 'tent-1',
        persona: `You are ${name}. ${personaText} ${sharedVoice}`
      }

      roster = [...roster, villager]
      saveRoster(roster)
      broadcast({ type: 'spawned', villager })
    } else if (parsed.type === 'remove') {
      if (seededIds.has(parsed.agentId)) {
        send(socket, { type: 'error', agentId: parsed.agentId, message: 'Seed villagers cannot be removed' })

        return
      }

      const before = roster.length
      roster = roster.filter((villager) => villager.id !== parsed.agentId)

      if (roster.length === before) {
        return
      }

      saveRoster(roster)
      deleteTranscript(parsed.agentId)
      sessions.get(parsed.agentId)?.close()
      sessions.delete(parsed.agentId)
      broadcast({ type: 'removed', agentId: parsed.agentId })
    }
  })

  socket.on('close', () => {
    sockets.delete(socket)

    for (const session of sessions.values()) {
      session.close()
    }

    sessions.clear()
  })
})

httpServer.listen(port, () => {
  const description: Record<ReturnType<typeof authMode>, string> = {
    'subscription-token': 'live — Claude subscription token',
    'api-key': 'live — Anthropic API key',
    'local-login': 'live — local Claude Code login (your subscription)',
    mock: 'mock — no credentials (run `claude login` or set CLAUDE_CODE_OAUTH_TOKEN)'
  }
  // eslint-disable-next-line no-console
  console.log(`agent backend listening on ws://localhost:${port}/agents — ${description[authMode()]}`)
  // eslint-disable-next-line no-console
  console.log(`storage: ${describeStorage()}`)
})
