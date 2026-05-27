import { createSignal } from 'solid-js'

import type { AgentStatus } from '../../shared/protocol'
import { agents, type AgentDescriptor } from '../world'

/**
 * Reactive bridge between the Phaser game and the Solid overlay. The scene
 * pushes updates in through the setters; the overlay reads the signals. Keeping
 * this in one module means the two worlds never reach into each other directly.
 */

/** One line in a chat transcript. */
export interface ChatLine {
  from: 'you' | 'agent'
  text: string
  /** Epoch milliseconds when the line was recorded. */
  at: number
}

/** localStorage key for an agent's saved transcript. */
const storageKey = (agentId: string): string => `claude-office:chat:${agentId}`

/**
 * Load an agent's saved transcript from localStorage.
 *
 * @param agentId - The agent whose history to load.
 * @returns The saved lines, or an empty array.
 */
function loadHistory(agentId: string): ChatLine[] {
  try {
    const raw = window.localStorage.getItem(storageKey(agentId))

    if (raw === null) {
      return []
    }

    const parsed = JSON.parse(raw) as ChatLine[]

    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * Persist an agent's transcript to localStorage.
 *
 * @param agentId - The agent whose history to save.
 * @param lines - The transcript to store.
 */
function saveHistory(agentId: string, lines: ChatLine[]): void {
  try {
    window.localStorage.setItem(storageKey(agentId), JSON.stringify(lines))
  } catch {
    // Storage full or unavailable — history just won't persist.
  }
}

const [nearbyAgent, setNearbyAgentSignal] = createSignal<AgentDescriptor | undefined>(undefined)

/** The agent the player has opened a chat with, or undefined when closed. */
const [chatAgent, setChatAgent] = createSignal<AgentDescriptor | undefined>(undefined)

/** The committed transcript for the open chat. */
const [chatLog, setChatLog] = createSignal<ChatLine[]>([])

/** The agent's in-progress streamed reply (shown live, before it commits). */
const [streamingReply, setStreamingReply] = createSignal('')

/** True between sending a message and the first reply token (the "thinking" state). */
const [awaitingReply, setAwaitingReply] = createSignal(false)

/** Whether the backend is running real Claude (true) or the mock (false). */
const [liveMode, setLiveMode] = createSignal(false)

/** Live status per agent id, for the roster HUD. */
const [agentStatuses, setAgentStatuses] = createSignal<Record<string, AgentStatus>>({})

export {
  nearbyAgent,
  chatAgent,
  chatLog,
  streamingReply,
  awaitingReply,
  liveMode,
  setLiveMode,
  agentStatuses
}

/**
 * Record which agent the player is standing next to, resolving the id to its
 * descriptor for the overlay to display.
 *
 * @param agentId - The nearby agent's id, or undefined when none is in range.
 */
export function setNearbyAgent(agentId: string | undefined): void {
  if (agentId === undefined) {
    setNearbyAgentSignal(undefined)

    return
  }

  const descriptor = agents.find((agent) => agent.id === agentId)

  setNearbyAgentSignal(descriptor)
}

/**
 * Record an agent's live status for the roster HUD.
 *
 * @param agentId - The agent.
 * @param status - Its new status.
 */
export function recordAgentStatus(agentId: string, status: AgentStatus): void {
  setAgentStatuses((current) => ({ ...current, [agentId]: status }))
}

/**
 * Open the chat panel for an agent, restoring its saved transcript.
 *
 * @param agentId - The agent to talk to.
 */
export function openChat(agentId: string): void {
  const descriptor = agents.find((agent) => agent.id === agentId)

  if (descriptor === undefined) {
    return
  }

  setChatAgent(descriptor)
  setChatLog(loadHistory(agentId))
  setStreamingReply('')
  setAwaitingReply(false)
}

/** Close the chat panel. */
export function closeChat(): void {
  setChatAgent(undefined)
  setStreamingReply('')
  setAwaitingReply(false)
}

/**
 * Append the player's line to the open transcript and persist it.
 *
 * @param text - What the player said.
 */
export function appendPlayerLine(text: string): void {
  const agent = chatAgent()

  if (agent === undefined) {
    return
  }

  setChatLog((lines) => [...lines, { from: 'you', text, at: Date.now() }])
  setAwaitingReply(true)
  saveHistory(agent.id, chatLog())
}

/**
 * Append a streamed token to the agent's in-progress reply.
 *
 * @param agentId - The agent the token belongs to.
 * @param text - The chunk of text.
 */
export function appendAgentToken(agentId: string, text: string): void {
  if (chatAgent()?.id !== agentId) {
    return
  }

  setAwaitingReply(false)
  setStreamingReply((current) => current + text)
}

/**
 * Commit an agent's finished reply to the transcript, persist it, and clear the
 * stream.
 *
 * @param agentId - The agent that replied.
 * @param text - The full reply.
 */
export function commitAgentReply(agentId: string, text: string): void {
  if (chatAgent()?.id !== agentId) {
    return
  }

  setChatLog((lines) => [...lines, { from: 'agent', text, at: Date.now() }])
  setStreamingReply('')
  setAwaitingReply(false)
  saveHistory(agentId, chatLog())
}
