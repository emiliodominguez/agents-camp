import { createServer } from 'node:http'

import { WebSocketServer, type WebSocket } from 'ws'

// Load a local .env (for ANTHROPIC_API_KEY etc.) if present; harmless if absent.
try {
  process.loadEnvFile()
} catch {
  // No .env file — run in mock mode unless the key is set another way.
}

import { personaById, personas } from '../shared/agents'
import type { ClientMessage, ServerMessage } from '../shared/protocol'
import { createSession, isLive, type AgentSession } from './agentSession'

const port = Number(process.env.AGENT_PORT ?? 8787)

const httpServer = createServer((request, response) => {
  if (request.url === '/health') {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ ok: true, live: isLive() }))

    return
  }

  response.writeHead(426)
  response.end('Upgrade required')
})

const webSocketServer = new WebSocketServer({ server: httpServer, path: '/agents' })

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

webSocketServer.on('connection', (socket) => {
  // Each connection owns its own per-agent sessions so tabs don't share state.
  const sessions = new Map<string, AgentSession>()

  /**
   * Lazily create (and cache) the session for an agent, wiring its callbacks to
   * this socket.
   *
   * @param agentId - The agent to get a session for.
   * @returns The session, or undefined if the agent id is unknown.
   */
  const sessionFor = (agentId: string): AgentSession | undefined => {
    const existing = sessions.get(agentId)

    if (existing !== undefined) {
      return existing
    }

    const persona = personaById(agentId)

    if (persona === undefined) {
      return undefined
    }

    const session = createSession(persona, {
      onStatus: (status) => send(socket, { type: 'status', agentId, status }),
      onToken: (text) => send(socket, { type: 'token', agentId, text }),
      onReply: (text) => send(socket, { type: 'reply', agentId, text }),
      onError: (message) => send(socket, { type: 'error', agentId, message })
    })

    sessions.set(agentId, session)

    return session
  }

  send(socket, { type: 'hello', agentIds: personas.map((persona) => persona.id), live: isLive() })

  socket.on('message', (raw) => {
    let parsed: ClientMessage

    try {
      parsed = JSON.parse(raw.toString()) as ClientMessage
    } catch {
      return
    }

    if (parsed.type !== 'chat' || typeof parsed.text !== 'string' || parsed.text.trim() === '') {
      return
    }

    const session = sessionFor(parsed.agentId)

    if (session === undefined) {
      send(socket, { type: 'error', agentId: parsed.agentId, message: 'Unknown agent' })

      return
    }

    session.send(parsed.text)
  })

  socket.on('close', () => {
    for (const session of sessions.values()) {
      session.close()
    }

    sessions.clear()
  })
})

httpServer.listen(port, () => {
  const mode = isLive() ? 'live (Claude Agent SDK)' : 'mock (no ANTHROPIC_API_KEY)'
  // eslint-disable-next-line no-console
  console.log(`agent backend listening on ws://localhost:${port}/agents — ${mode}`)
})
