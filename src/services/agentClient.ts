import type { AgentStatus, ClientMessage, ServerMessage } from '../../shared/protocol'

/**
 * Browser-side client for the agent backend. Opens a WebSocket (proxied through
 * Vite at `/agents`), sends the player's chat messages, and dispatches the
 * server's status/token/reply events to registered listeners. The Phaser scene
 * subscribes for status; the Solid overlay subscribes for the chat stream.
 */

type StatusListener = (agentId: string, status: AgentStatus) => void
type TokenListener = (agentId: string, text: string) => void
type ReplyListener = (agentId: string, text: string) => void
type HelloListener = (live: boolean) => void

const statusListeners = new Set<StatusListener>()
const tokenListeners = new Set<TokenListener>()
const replyListeners = new Set<ReplyListener>()
const helloListeners = new Set<HelloListener>()

let socket: WebSocket | undefined
let reconnectTimer: ReturnType<typeof setTimeout> | undefined

/** Resolve the backend WebSocket URL from the current page origin. */
function socketUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'

  return `${protocol}://${window.location.host}/agents`
}

/** Open the socket and wire its lifecycle, reconnecting on drop. */
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
    }
  })

  ws.addEventListener('close', () => {
    socket = undefined

    // Reconnect after a short delay so a backend restart recovers on its own.
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

/** Open the connection (idempotent). Call once at startup. */
export function startAgentClient(): void {
  if (socket === undefined) {
    connect()
  }
}

/**
 * Send a chat message to an agent.
 *
 * @param agentId - The agent being addressed.
 * @param text - The player's message.
 */
export function sendChat(agentId: string, text: string): void {
  if (socket === undefined || socket.readyState !== WebSocket.OPEN) {
    return
  }

  const message: ClientMessage = { type: 'chat', agentId, text }
  socket.send(JSON.stringify(message))
}

/**
 * Subscribe to agent status changes.
 *
 * @param listener - Called with `(agentId, status)` on each change.
 * @returns An unsubscribe function.
 */
export function onAgentStatus(listener: StatusListener): () => void {
  statusListeners.add(listener)

  return () => statusListeners.delete(listener)
}

/**
 * Subscribe to streamed reply tokens.
 *
 * @param listener - Called with `(agentId, textChunk)` per chunk.
 * @returns An unsubscribe function.
 */
export function onAgentToken(listener: TokenListener): () => void {
  tokenListeners.add(listener)

  return () => tokenListeners.delete(listener)
}

/**
 * Subscribe to completed replies.
 *
 * @param listener - Called with `(agentId, fullText)` when a reply finishes.
 * @returns An unsubscribe function.
 */
export function onAgentReply(listener: ReplyListener): () => void {
  replyListeners.add(listener)

  return () => replyListeners.delete(listener)
}

/**
 * Subscribe to the connection handshake, which reports whether the backend is
 * running real Claude.
 *
 * @param listener - Called with `live` when the server says hello.
 * @returns An unsubscribe function.
 */
export function onAgentHello(listener: HelloListener): () => void {
  helloListeners.add(listener)

  return () => helloListeners.delete(listener)
}
