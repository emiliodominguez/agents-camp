import { claudeHarnessDefinition } from './harnesses/claude'
import { codexHarnessDefinition } from './harnesses/codex'
import type { AgentHarnessDefinition, AgentHarnessId } from './harnesses/types'

export type { AgentHarnessDefinition, AgentHarnessId } from './harnesses/types'

/** Default runtime for old saved villagers and new spawns when none is picked. */
export const defaultHarness: AgentHarnessId = 'claude'

/** Registry of selectable runtimes. UI and server status should derive from this. */
export const harnessDefinitions: AgentHarnessDefinition[] = [
  claudeHarnessDefinition,
  codexHarnessDefinition
]

/** Whether a free-form value names a supported runtime. */
export function isAgentHarnessId(value: unknown): value is AgentHarnessId {
  return typeof value === 'string' && harnessDefinitions.some((harness) => harness.id === value)
}

/** Normalize unknown persisted/client values to a supported runtime. */
export function normalizeHarness(value: unknown): AgentHarnessId {
  return isAgentHarnessId(value) ? value : defaultHarness
}

/** Lookup runtime metadata. */
export function harnessById(id: AgentHarnessId): AgentHarnessDefinition {
  return harnessDefinitions.find((harness) => harness.id === id) ?? harnessDefinitions[0]!
}
