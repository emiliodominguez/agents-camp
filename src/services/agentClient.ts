import type { Villager } from '../../shared/agents'
import type { AgentStatus, ChatLine, ClientMessage, ServerMessage } from '../../shared/protocol'

/**
 * Browser-side client for the agent backend. Opens a WebSocket (proxied through
 * Vite at `/agents`), sends the player's chat messages and spawn/remove
 * requests, and dispatches the server's events to registered listeners.
 */

type StatusListener = (agentId: string, status: AgentStatus) => void
type TokenListener = (agentId: string, text: string) => void
type ReplyListener = (agentId: string, text: string) => void
type HelloListener = (live: boolean) => void
type RosterListener = (villagers: Villager[]) => void
type SpawnedListener = (villager: Villager) => void
type RemovedListener = (agentId: string) => void
type HistoryListener = (agentId: string, lines: ChatLine[]) => void

const statusListeners = new Set<StatusListener>()
const tokenListeners = new Set<TokenListener>()
const replyListeners = new Set<ReplyListener>()
const helloListeners = new Set<HelloListener>()
const rosterListeners = new Set<RosterListener>()
const spawnedListeners = new Set<SpawnedListener>()
const removedListeners = new Set<RemovedListener>()
const historyListeners = new Set<HistoryListener>()

let socket: WebSocket | undefined
let reconnectTimer: ReturnType<typeof setTimeout> | undefined

function socketUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'

  return `${protocol}://${window.location.host}/agents`
}

function connect(): void {
  const ws = new WebSocket(socketUrl())
  socket = ws

  ws.addEventListener('message', (event) => {
    let message: ServerMessage

    try {
      message = JSON.parse(event.data as string) as ServerMessage
    } catch {
      return
    }

    if (message.type === 'hello') {
      for (const listener of helloListeners) {
        listener(message.live)
      }
    } else if (message.type === 'roster') {
      for (const listener of rosterListeners) {
        listener(message.villagers)
      }
    } else if (message.type === 'spawned') {
      for (const listener of spawnedListeners) {
        listener(message.villager)
      }
    } else if (message.type === 'removed') {
      for (const listener of removedListeners) {
        listener(message.agentId)
      }
    } else if (message.type === 'status') {
      for (const listener of statusListeners) {
        listener(message.agentId, message.status)
      }
    } else if (message.type === 'token') {
      for (const listener of tokenListeners) {
        listener(message.agentId, message.text)
      }
    } else if (message.type === 'reply') {
      for (const listener of replyListeners) {
        listener(message.agentId, message.text)
      }
    } else if (message.type === 'history') {
      for (const listener of historyListeners) {
        listener(message.agentId, message.lines)
      }
    }
  })

  ws.addEventListener('close', () => {
    socket = undefined

    if (reconnectTimer === undefined) {
      reconnectTimer = setTimeout(() => {
        reconnectTimer = undefined
        connect()
      }, 1500)
    }
  })

  ws.addEventListener('error', () => {
    ws.close()
  })
}

/** Send a typed client message if the socket is open. */
function sendMessage(message: ClientMessage): void {
  if (socket === undefined || socket.readyState !== WebSocket.OPEN) {
    return
  }

  socket.send(JSON.stringify(message))
}

/** Open the connection (idempotent). Call once at startup. */
export function startAgentClient(): void {
  if (socket === undefined) {
    connect()
  }
}

/**
 * Send a chat message to a villager.
 *
 * @param agentId - The villager being addressed.
 * @param text - The player's message.
 */
export function sendChat(agentId: string, text: string): void {
  sendMessage({ type: 'chat', agentId, text })
}

/**
 * Ask the server for the saved transcript of a villager.
 *
 * @param agentId - The villager.
 */
export function requestHistory(agentId: string): void {
  sendMessage({ type: 'history', agentId })
}

/**
 * Ask the server to spawn a new villager.
 *
 * @param name - Display name.
 * @param persona - Role persona (becomes the system prompt).
 * @param sprite - Character sprite key (e.g. `citizen-3`).
 * @param tile - Tile to spawn on.
 */
export function sendSpawn(
  name: string,
  persona: string,
  sprite: string,
  tile: { column: number; row: number }
): void {
  sendMessage({ type: 'spawn', name, persona, sprite, tile })
}

/**
 * Ask the server to remove a spawned villager.
 *
 * @param agentId - The villager to remove.
 */
export function sendRemove(agentId: string): void {
  sendMessage({ type: 'remove', agentId })
}

export function onAgentStatus(listener: StatusListener): () => void {
  statusListeners.add(listener)

  return () => statusListeners.delete(listener)
}

export function onAgentToken(listener: TokenListener): () => void {
  tokenListeners.add(listener)

  return () => tokenListeners.delete(listener)
}

export function onAgentReply(listener: ReplyListener): () => void {
  replyListeners.add(listener)

  return () => replyListeners.delete(listener)
}

export function onAgentHello(listener: HelloListener): () => void {
  helloListeners.add(listener)

  return () => helloListeners.delete(listener)
}

export function onRoster(listener: RosterListener): () => void {
  rosterListeners.add(listener)

  return () => rosterListeners.delete(listener)
}

export function onSpawned(listener: SpawnedListener): () => void {
  spawnedListeners.add(listener)

  return () => spawnedListeners.delete(listener)
}

export function onRemoved(listener: RemovedListener): () => void {
  removedListeners.add(listener)

  return () => removedListeners.delete(listener)
}

export function onHistory(listener: HistoryListener): () => void {
  historyListeners.add(listener)

  return () => historyListeners.delete(listener)
}
