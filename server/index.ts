import { createServer } from 'node:http'

import { WebSocketServer, type WebSocket } from 'ws'

import { defaultSeed, dotColorPalette, type Villager } from '../shared/agents'
import { normalizeHarness } from '../shared/harnesses'
import type { ClientMessage, ServerMessage, UsageSnapshot, VillagerUsage } from '../shared/protocol'
import { createSession, defaultAgentHarness, harnessStatuses, isLive, type AgentSession } from './harnesses'
import { buildSessionHandoff } from './harnesses/handoff'
import { listSkills } from './skills'
import {
  appendTranscriptLine,
  deleteTranscript,
  deleteWorkspace,
  describeStorage,
  ensureWorkspace,
  loadRoster,
  loadTranscript,
  loadUsage,
  saveRoster,
  saveUsage
} from './storage'

// Load a local .env (for harness credentials/config) if present; harmless if absent.
try {
  process.loadEnvFile()
} catch {
  // No .env file — harness adapters fall back to local credentials or mock mode.
}

const port = Number(process.env.AGENT_PORT ?? 8787)

const httpServer = createServer((request, response) => {
  if (request.url === '/health') {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ ok: true, live: isLive(), harnesses: harnessStatuses(), villagers: roster.length }))

    return
  }

  response.writeHead(426)
  response.end('Upgrade required')
})

const webSocketServer = new WebSocketServer({ server: httpServer, path: '/agents' })

/** The current roster, loaded once on boot; saves on every mutation. */
let roster: Villager[] = loadRoster().map((villager) => ({
  ...villager,
  harness: normalizeHarness(villager.harness ?? defaultAgentHarness())
}))

/** All-time per-villager usage, keyed by agentId. Persisted on every update. */
const usage = loadUsage()

/** Build the wire snapshot from the in-memory usage map. */
function usageSnapshot(): UsageSnapshot {
  const villagers: VillagerUsage[] = [...usage.values()].map((entry) => {
    const villager = roster.find((candidate) => candidate.id === entry.agentId)

    return {
      ...entry,
      harness: normalizeHarness(villager?.harness ?? entry.harness ?? defaultAgentHarness())
    }
  })
  const totals = villagers.reduce(
    (accumulator, entry) => ({
      turns: accumulator.turns + entry.turns,
      inputTokens: accumulator.inputTokens + entry.inputTokens,
      outputTokens: accumulator.outputTokens + entry.outputTokens,
      cacheCreateTokens: accumulator.cacheCreateTokens + entry.cacheCreateTokens,
      cacheReadTokens: accumulator.cacheReadTokens + entry.cacheReadTokens
    }),
    { turns: 0, inputTokens: 0, outputTokens: 0, cacheCreateTokens: 0, cacheReadTokens: 0 }
  )

  return { villagers, totals, at: Date.now() }
}

/** Every connected socket, so roster broadcasts reach all open tabs. */
const sockets = new Set<WebSocket>()

/** Per-socket session maps, used to invalidate a villager session across tabs. */
const sessionMaps = new Set<Map<string, AgentSession>>()

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

/** Close cached sessions for one villager across every connected socket. */
function closeAgentSessions(agentId: string): void {
  for (const map of sessionMaps) {
    map.get(agentId)?.close()
    map.delete(agentId)
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

/** Pick a pleasant default dot colour from the shared palette. */
function pickDotColor(): string {
  return dotColorPalette[roster.length % dotColorPalette.length] ?? '#7c9cff'
}

webSocketServer.on('connection', (socket) => {
  sockets.add(socket)

  // Each connection owns its own per-villager sessions so tabs don't share
  // streaming state. The roster itself is shared (server-owned).
  const sessions = new Map<string, AgentSession>()
  sessionMaps.add(sessions)

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

    const workspace = ensureWorkspace(agentId)
    const harness = normalizeHarness(villager.harness ?? defaultAgentHarness())
    const handoff = buildSessionHandoff(villager, loadTranscript(agentId))

    const session = createSession(
      villager,
      {
        onStatus: (status) => send(socket, { type: 'status', agentId, status }),
        onToken: (text) => send(socket, { type: 'token', agentId, text }),
        onReply: (text) => {
          appendTranscriptLine(agentId, { kind: 'message', from: 'agent', text, at: Date.now(), harness })
          send(socket, { type: 'reply', agentId, text, harness })
        },
        onTool: (event) => {
          appendTranscriptLine(agentId, {
            kind: 'tool',
            name: event.name,
            input: event.input,
            summary: event.summary,
            at: Date.now(),
            harness
          })
          send(socket, { type: 'tool', agentId, name: event.name, input: event.input, summary: event.summary, harness })
        },
        onQuestion: (event) => {
          appendTranscriptLine(agentId, {
            kind: 'question',
            from: 'agent',
            at: Date.now(),
            question: { ...event },
            harness
          })
          send(socket, { type: 'question', agentId, question: { ...event }, harness })
        },
        onResult: (event) => {
          const current = usage.get(agentId) ?? {
            agentId,
            name: villager.name,
            harness,
            turns: 0,
            inputTokens: 0,
            outputTokens: 0,
            cacheCreateTokens: 0,
            cacheReadTokens: 0
          }

          const updated: VillagerUsage = {
            ...current,
            name: villager.name,
            harness,
            turns: current.turns + event.turns,
            inputTokens: current.inputTokens + event.inputTokens,
            outputTokens: current.outputTokens + event.outputTokens,
            cacheCreateTokens: current.cacheCreateTokens + event.cacheCreateTokens,
            cacheReadTokens: current.cacheReadTokens + event.cacheReadTokens,
            lastActiveAt: Date.now()
          }

          usage.set(agentId, updated)
          saveUsage(usage)
          broadcast({ type: 'usage', usage: usageSnapshot() })
        },
        onError: (message) => {
          appendTranscriptLine(agentId, { kind: 'error', message, at: Date.now(), harness })
          send(socket, { type: 'error', agentId, message, harness })
        }
      },
      workspace,
      handoff
    )

    sessions.set(agentId, session)

    return session
  }

  send(socket, {
    type: 'hello',
    live: isLive(),
    harnesses: harnessStatuses(),
    defaultHarness: defaultAgentHarness()
  })
  send(socket, { type: 'roster', villagers: roster })
  send(socket, { type: 'usage', usage: usageSnapshot() })

  void (async () => {
    const skills = await listSkills()
    send(socket, { type: 'skills', skills })
  })()

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
      appendTranscriptLine(parsed.agentId, {
        kind: 'message',
        from: 'you',
        text: parsed.text,
        at: Date.now()
      })
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
        dotColor: parsed.dotColor ?? pickDotColor(),
        // New villagers get a tent so spawning is light-weight.
        structure: 'tent-1',
        harness: normalizeHarness(parsed.harness ?? defaultAgentHarness()),
        persona: `You are ${name}. ${personaText}`,
        toolScope: parsed.toolScope ?? 'full'
      }

      roster = [...roster, villager]
      saveRoster(roster)
      broadcast({ type: 'spawned', villager })
    } else if (parsed.type === 'seed') {
      const seeds = defaultSeed()
      const existingIds = new Set(roster.map((v) => v.id))
      const liveHarnesses = new Set(harnessStatuses().filter((h) => h.live).map((h) => h.id))
      const additions = seeds.filter(
        (s) => !existingIds.has(s.id) && liveHarnesses.has(normalizeHarness(s.harness ?? defaultAgentHarness()))
      )

      if (additions.length === 0) {
        return
      }

      roster = [...roster, ...additions]
      saveRoster(roster)

      for (const villager of additions) {
        broadcast({ type: 'spawned', villager })
      }
    } else if (parsed.type === 'answer') {
      const session = sessions.get(parsed.agentId)

      if (session === undefined) {
        return
      }

      session.answer(parsed.toolUseId, parsed.answers)
    } else if (parsed.type === 'update') {
      const target = roster.find((villager) => villager.id === parsed.agentId)

      if (target === undefined) {
        send(socket, { type: 'error', agentId: parsed.agentId, message: 'Unknown villager' })

        return
      }

      const updated: Villager = {
        ...target,
        name: parsed.name?.trim() !== '' && parsed.name !== undefined ? parsed.name.trim() : target.name,
        harness: normalizeHarness(parsed.harness ?? target.harness ?? defaultAgentHarness()),
        persona:
          parsed.persona?.trim() !== '' && parsed.persona !== undefined ? parsed.persona.trim() : target.persona
      }

      roster = roster.map((villager) => (villager.id === parsed.agentId ? updated : villager))
      saveRoster(roster)

      // Close any existing session so the next message rebuilds with the new
      // prompt and selected harness; provider sessions are not portable.
      closeAgentSessions(parsed.agentId)

      broadcast({ type: 'roster', villagers: roster })
    } else if (parsed.type === 'remove') {
      const before = roster.length
      roster = roster.filter((villager) => villager.id !== parsed.agentId)

      if (roster.length === before) {
        return
      }

      saveRoster(roster)
      deleteTranscript(parsed.agentId)
      deleteWorkspace(parsed.agentId)
      usage.delete(parsed.agentId)
      saveUsage(usage)
      closeAgentSessions(parsed.agentId)
      broadcast({ type: 'removed', agentId: parsed.agentId })
      broadcast({ type: 'usage', usage: usageSnapshot() })
    }
  })

  socket.on('close', () => {
    sockets.delete(socket)
    sessionMaps.delete(sessions)

    for (const session of sessions.values()) {
      session.close()
    }

    sessions.clear()
  })
})

httpServer.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`agent backend listening on ws://localhost:${port}/agents`)
  // eslint-disable-next-line no-console
  console.log(`harnesses: ${harnessStatuses().map((harness) => `${harness.label}: ${harness.detail}`).join('; ')}`)
  // eslint-disable-next-line no-console
  console.log(`storage: ${describeStorage()}`)
})
