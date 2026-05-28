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

/** A skill the villagers can call (read from ~/.claude/skills + project skills). */
export interface SkillSummary {
  /** Skill name (folder name). */
  name: string
  /** Origin: "user" (~/.claude/skills) or "project" (.claude/skills). */
  source: 'user' | 'project'
  /** One-line description, parsed from the skill's frontmatter or first line. */
  description: string
}

/** One option in an AskUserQuestion-style multi-choice. */
export interface QuestionOption {
  label: string
  description?: string
}

/** A question the agent asked, awaiting the player to pick an option. */
export interface AgentQuestion {
  toolUseId: string
  question: string
  header?: string
  multiSelect: boolean
  options: QuestionOption[]
  answered?: string[]
}

/**
 * One persisted line in a chat transcript. Tool calls and questions are
 * captured alongside ordinary text so transcripts read in order.
 */
export type ChatLine =
  | {
      kind: 'message'
      from: 'you' | 'agent'
      text: string
      at: number
    }
  | {
      kind: 'tool'
      name: string
      input: unknown
      /** Brief one-line summary for compact display. */
      summary: string
      at: number
    }
  | {
      kind: 'question'
      from: 'agent'
      at: number
      question: AgentQuestion
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
      /** Remove a villager. */
      type: 'remove'
      agentId: string
    }
  | {
      /** Update a villager's persona (system prompt) and/or display name. */
      type: 'update'
      agentId: string
      name?: string
      persona?: string
    }
  | {
      /** Answer an AskUserQuestion the agent posed. */
      type: 'answer'
      agentId: string
      toolUseId: string
      /** Labels of the selected options. */
      answers: string[]
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
      /** The list of skills available for villagers to call. */
      type: 'skills'
      skills: SkillSummary[]
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
      /** The agent called a tool (real-time event for the chat UI). */
      type: 'tool'
      agentId: string
      name: string
      input: unknown
      summary: string
    }
  | {
      /** The agent asked the player a multi-choice question. */
      type: 'question'
      agentId: string
      question: AgentQuestion
    }
  | {
      /** Something went wrong handling a message for an agent. */
      type: 'error'
      agentId: string
      message: string
    }
