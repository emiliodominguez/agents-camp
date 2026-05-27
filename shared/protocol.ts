/**
 * The WebSocket message protocol shared by the agent backend (`server/`) and
 * the browser frontend (`src/services/agentClient.ts`). Keeping it in one place
 * means both ends move together when the protocol changes.
 *
 * The frontend sends {@link ClientMessage}s; the server replies with
 * {@link ServerMessage}s. Every message names the agent it concerns by id.
 */

/** Lifecycle state of an agent, mirrored from `src/world.ts`'s `AgentStatus`. */
export type AgentStatus = 'idle' | 'working' | 'talking'

/** A message sent from the browser to the agent backend. */
export type ClientMessage = {
  /** The player said something to an agent. */
  type: 'chat'
  /** Which agent is being addressed. */
  agentId: string
  /** The player's message text. */
  text: string
}

/** A message sent from the agent backend to the browser. */
export type ServerMessage =
  | {
      /** Connection handshake: the agents the server knows about and whether it is running real Claude. */
      type: 'hello'
      agentIds: string[]
      /** True when a real Claude API key is configured; false in mock mode. */
      live: boolean
    }
  | {
      /** An agent's lifecycle state changed. Drives the status bubble. */
      type: 'status'
      agentId: string
      status: AgentStatus
    }
  | {
      /** A chunk of streamed reply text from an agent (live "typing"). */
      type: 'token'
      agentId: string
      text: string
    }
  | {
      /** An agent finished a reply; `text` is the complete final message. */
      type: 'reply'
      agentId: string
      text: string
    }
  | {
      /** Something went wrong handling a message for an agent. */
      type: 'error'
      agentId: string
      message: string
    }
