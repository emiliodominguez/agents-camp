import { createSignal } from 'solid-js'

import type { Villager } from '../../shared/agents'
import { defaultHarness, type AgentHarnessId } from '../../shared/harnesses'
import type { AgentStatus, ChatLine, HarnessRuntimeStatus } from '../../shared/protocol'
import type { AgentConnectionState } from '../services/agent-client'
import { villagerById } from '../state/roster'

export type { ChatLine }

/**
 * Reactive bridge between the Phaser game and the Solid overlay. The scene
 * pushes updates in through the setters; the overlay reads the signals.
 *
 * Transcripts and the roster are server-backed — this module just mirrors the
 * latest state for the UI.
 */

const [nearbyAgent, setNearbyAgentSignal] = createSignal<Villager | undefined>(undefined)

/** Cell of an empty plot the player is near (drives the "Spawn villager" prompt). */
const [nearbyPlot, setNearbyPlot] = createSignal<{ column: number; row: number } | undefined>(undefined)

/** The villager the player has opened a chat with, or undefined when closed. */
const [chatAgent, setChatAgent] = createSignal<Villager | undefined>(undefined)

/** Whether the spawn dialog is open. */
const [spawnOpen, setSpawnOpen] = createSignal(false)

/** When true on chat open, the instructions panel auto-expands (used by the
 * roster's edit shortcut). Cleared after the chat reads it. */
const [chatAutoExpandInstructions, setChatAutoExpandInstructions] = createSignal(false)

export { chatAutoExpandInstructions, setChatAutoExpandInstructions }

/** The committed transcript for the open chat. */
const [chatLog, setChatLog] = createSignal<ChatLine[]>([])

/** The villager's in-progress streamed reply (shown live, before it commits). */
const [streamingReply, setStreamingReply] = createSignal('')

/** True between sending a message and the first reply token (the "thinking" state). */
const [awaitingReply, setAwaitingReply] = createSignal(false)

/** Whether at least one backend harness is live (true) or all harnesses are mocked. */
const [liveMode, setLiveMode] = createSignal(false)

/** Browser WebSocket state for the agent backend. */
const [agentConnectionState, setAgentConnectionState] = createSignal<AgentConnectionState>('connecting')

/** Backend runtime availability, keyed by harness. */
const [harnessStatuses, setHarnessStatuses] = createSignal<HarnessRuntimeStatus[]>([])

/** Default harness used by the backend for new or legacy villagers. */
const [defaultAgentHarness, setDefaultAgentHarness] = createSignal<AgentHarnessId>(defaultHarness)

/** Live status per villager id, for the roster HUD. */
const [agentStatuses, setAgentStatuses] = createSignal<Record<string, AgentStatus>>({})

export {
  nearbyAgent,
  nearbyPlot,
  setNearbyPlot,
  chatAgent,
  spawnOpen,
  setSpawnOpen,
  chatLog,
  streamingReply,
  awaitingReply,
  liveMode,
  agentConnectionState,
  setAgentConnectionState,
  harnessStatuses,
  defaultAgentHarness,
  agentStatuses
}

/** Record backend runtime status from the WebSocket hello message. */
export function setBackendStatus(status: {
  live: boolean
  harnesses: HarnessRuntimeStatus[]
  defaultHarness: AgentHarnessId
}): void {
  setLiveMode(status.live)
  setHarnessStatuses(status.harnesses)
  setDefaultAgentHarness(status.defaultHarness)
}

/**
 * Record which villager the player is standing next to.
 *
 * @param agentId - The nearby villager's id, or undefined when none is in range.
 */
export function setNearbyAgent(agentId: string | undefined): void {
  if (agentId === undefined) {
    setNearbyAgentSignal(undefined)

    return
  }

  setNearbyAgentSignal(villagerById(agentId))
}

/**
 * Record a villager's live status for the roster HUD.
 *
 * @param agentId - The villager.
 * @param status - Its new status.
 */
export function recordAgentStatus(agentId: string, status: AgentStatus): void {
  setAgentStatuses((current) => ({ ...current, [agentId]: status }))
}

/**
 * Open the chat panel for a villager. The transcript is filled in by the
 * server's `history` reply, so we start empty here.
 *
 * @param agentId - The villager to talk to.
 */
export function openChat(agentId: string): void {
  const villager = villagerById(agentId)

  if (villager === undefined) {
    return
  }

  setChatAgent(villager)
  setChatLog([])
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
 * Replace the open chat's transcript with the server-supplied history.
 *
 * @param agentId - The villager whose history arrived.
 * @param lines - The full transcript.
 */
export function setChatHistory(agentId: string, lines: ChatLine[]): void {
  if (chatAgent()?.id !== agentId) {
    return
  }

  setChatLog(lines)
}

/**
 * Append the player's line to the open transcript (server also persists it).
 *
 * @param text - What the player said.
 */
export function appendPlayerLine(text: string): void {
  if (chatAgent() === undefined) {
    return
  }

  setChatLog((lines) => [...lines, { kind: 'message', from: 'you', text, at: Date.now() }])
  setAwaitingReply(true)
}

/** Show a backend/harness error inline in the open chat and clear pending reply state. */
export function recordAgentError(agentId: string, message: string, harness?: AgentHarnessId): void {
  if (chatAgent()?.id !== agentId) {
    return
  }

  setChatLog((lines) => [...lines, { kind: 'error', message, at: Date.now(), harness }])
  setStreamingReply('')
  setAwaitingReply(false)
  setAgentStatuses((current) => ({ ...current, [agentId]: 'idle' }))
}

/**
 * Append a streamed token to the agent's in-progress reply.
 *
 * @param agentId - The villager the token belongs to.
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
 * Commit a villager's finished reply to the transcript and clear the stream.
 *
 * @param agentId - The villager that replied.
 * @param text - The full reply.
 */
export function commitAgentReply(agentId: string, text: string, harness?: AgentHarnessId): void {
  if (chatAgent()?.id !== agentId) {
    return
  }

  setChatLog((lines) => [...lines, { kind: 'message', from: 'agent', text, at: Date.now(), harness }])
  setStreamingReply('')
  setAwaitingReply(false)
}

/**
 * Append a tool-call to the transcript so the UI can show what the villager
 * is doing (reading, editing, calling skills, etc.).
 *
 * @param agentId - The villager that called the tool.
 * @param tool - Tool name, input, and summary.
 */
export function appendAgentTool(
  agentId: string,
  tool: { name: string; input: unknown; summary: string; harness?: AgentHarnessId }
): void {
  if (chatAgent()?.id !== agentId) {
    return
  }

  setChatLog((lines) => [
    ...lines,
    { kind: 'tool', name: tool.name, input: tool.input, summary: tool.summary, at: Date.now(), harness: tool.harness }
  ])
}

/**
 * Append an AskUserQuestion that the villager raised.
 *
 * @param agentId - The villager asking.
 * @param question - The question event.
 */
export function appendAgentQuestion(
  agentId: string,
  question: import('../../shared/protocol').AgentQuestion,
  harness?: AgentHarnessId
): void {
  if (chatAgent()?.id !== agentId) {
    return
  }

  setChatLog((lines) => [...lines, { kind: 'question', from: 'agent', at: Date.now(), question, harness }])
}

/**
 * Mark a question as answered (used after the player picks options).
 *
 * @param toolUseId - The id of the question.
 * @param picks - The chosen option labels.
 */
export function markQuestionAnswered(toolUseId: string, picks: string[]): void {
  setChatLog((lines) =>
    lines.map((line) =>
      line.kind === 'question' && line.question.toolUseId === toolUseId
        ? { ...line, question: { ...line.question, answered: picks } }
        : line
    )
  )
}
