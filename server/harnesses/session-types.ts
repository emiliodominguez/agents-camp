import type { Villager } from '../../shared/agents'
import type { AgentHarnessId } from '../../shared/harnesses'
import type { AgentStatus, ChatLine, HarnessRuntimeState } from '../../shared/protocol'

/**
 * Callbacks an AgentSession uses to report progress back to whoever owns it.
 */
export interface SessionHandlers {
  onStatus: (status: AgentStatus) => void
  onToken: (text: string) => void
  onReply: (text: string) => void
  onTool: (event: { name: string; input: unknown; summary: string }) => void
  onQuestion: (event: AgentQuestionEvent) => void
  onResult?: (event: ResultEvent) => void
  onError: (message: string) => void
}

/** Per-turn result event for usage tracking. */
export interface ResultEvent {
  turns: number
  inputTokens: number
  outputTokens: number
  cacheCreateTokens: number
  cacheReadTokens: number
  durationMs: number
}

/** Backend availability details for one runtime. */
export interface HarnessRuntime {
  id: AgentHarnessId
  label: string
  live: boolean
  state: HarnessRuntimeState
  detail: string
  help: string[]
}

/** A multi-choice question yielded by an AskUserQuestion-style tool. */
export interface AgentQuestionEvent {
  toolUseId: string
  question: string
  header?: string
  multiSelect: boolean
  options: Array<{ label: string; description?: string }>
}

/** A long-lived conversation with one agent. */
export interface AgentSession {
  send: (text: string) => void
  answer: (toolUseId: string, picks: string[]) => void
  close: () => void
}

/** Portable transcript context passed when a harness session starts or switches. */
export interface SessionHandoff {
  transcript: ChatLine[]
  prompt: string
}

/** One server-side implementation for a registered harness. */
export interface HarnessAdapter {
  id: AgentHarnessId
  isLive: () => boolean
  status: () => HarnessRuntime
  create: (villager: Villager, handlers: SessionHandlers, cwd: string, handoff: SessionHandoff) => AgentSession
}
