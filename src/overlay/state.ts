import { createSignal } from 'solid-js'

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
}

const [nearbyAgent, setNearbyAgentSignal] = createSignal<AgentDescriptor | undefined>(undefined)

/** The agent the player has opened a chat with, or undefined when closed. */
const [chatAgent, setChatAgent] = createSignal<AgentDescriptor | undefined>(undefined)

/** The committed transcript for the open chat. */
const [chatLog, setChatLog] = createSignal<ChatLine[]>([])

/** The agent's in-progress streamed reply (shown live, before it commits). */
const [streamingReply, setStreamingReply] = createSignal('')

/** Whether the backend is running real Claude (true) or the mock (false). */
const [liveMode, setLiveMode] = createSignal(false)

export { nearbyAgent, chatAgent, chatLog, streamingReply, liveMode, setLiveMode }

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
 * Open the chat panel for an agent, starting a fresh transcript.
 *
 * @param agentId - The agent to talk to.
 */
export function openChat(agentId: string): void {
  const descriptor = agents.find((agent) => agent.id === agentId)

  if (descriptor === undefined) {
    return
  }

  setChatAgent(descriptor)
  setChatLog([])
  setStreamingReply('')
}

/** Close the chat panel. */
export function closeChat(): void {
  setChatAgent(undefined)
  setStreamingReply('')
}

/**
 * Append the player's line to the open transcript.
 *
 * @param text - What the player said.
 */
export function appendPlayerLine(text: string): void {
  setChatLog((lines) => [...lines, { from: 'you', text }])
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

  setStreamingReply((current) => current + text)
}

/**
 * Commit an agent's finished reply to the transcript and clear the stream.
 *
 * @param agentId - The agent that replied.
 * @param text - The full reply.
 */
export function commitAgentReply(agentId: string, text: string): void {
  if (chatAgent()?.id !== agentId) {
    return
  }

  setChatLog((lines) => [...lines, { from: 'agent', text }])
  setStreamingReply('')
}
