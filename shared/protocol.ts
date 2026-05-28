/**
 * The WebSocket message protocol shared by the agent backend (`server/`) and
 * the browser frontend (`src/services/agentClient.ts`). Keeping it in one place
 * means both ends move together when the protocol changes.
 *
 * The frontend sends {@link ClientMessage}s; the server replies with
 * {@link ServerMessage}s. Every message names the agent (villager) it concerns
 * by id where relevant.
 */

import type { Villager } from './agents'

/** Lifecycle state of a villager, mirrored from agents.ts. */
export type AgentStatus = 'idle' | 'working' | 'talking'

/** One persisted line in a chat transcript. */
export interface ChatLine {
  from: 'you' | 'agent'
  text: string
  /** Epoch milliseconds when the line was recorded. */
  at: number
}

/** A message sent from the browser to the agent backend. */
export type ClientMessage =
  | {
      /** The player said something to a villager. */
      type: 'chat'
      agentId: string
      text: string
    }
  | {
      /** Ask the server to send the saved transcript for an agent. */
      type: 'history'
      agentId: string
    }
  | {
      /** Spawn a new villager into the camp. */
      type: 'spawn'
      name: string
      persona: string
      sprite: string
      tile: { column: number; row: number }
    }
  | {
      /** Remove a spawned villager (only user-created villagers can be removed). */
      type: 'remove'
      agentId: string
    }

/** A message sent from the agent backend to the browser. */
export type ServerMessage =
  | {
      /** Connection handshake: live/mock state and basic server info. */
      type: 'hello'
      live: boolean
    }
  | {
      /** The current roster (sent on connect and whenever it changes). */
      type: 'roster'
      villagers: Villager[]
    }
  | {
      /** A new villager joined. */
      type: 'spawned'
      villager: Villager
    }
  | {
      /** A villager was removed. */
      type: 'removed'
      agentId: string
    }
  | {
      /** A villager's lifecycle state changed. Drives the status bubble. */
      type: 'status'
      agentId: string
      status: AgentStatus
    }
  | {
      /** A chunk of streamed reply text from a villager (live "typing"). */
      type: 'token'
      agentId: string
      text: string
    }
  | {
      /** A villager finished a reply; `text` is the complete final message. */
      type: 'reply'
      agentId: string
      text: string
    }
  | {
      /** Server-supplied transcript for a villager (in response to `history`). */
      type: 'history'
      agentId: string
      lines: ChatLine[]
    }
  | {
      /** Something went wrong handling a message for an agent. */
      type: 'error'
      agentId: string
      message: string
    }
