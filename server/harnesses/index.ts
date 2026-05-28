import type { Villager } from '../../shared/agents'
import {
  defaultHarness,
  harnessDefinitions,
  normalizeHarness,
  type AgentHarnessId
} from '../../shared/harnesses'
import { claudeHarness } from './claude-session'
import { codexHarness } from './codex-session'
import { createMockSession } from './mock-session'
import type { AgentSession, HarnessAdapter, HarnessRuntime, SessionHandlers } from './session-types'

export type { AgentSession, HarnessRuntime, SessionHandlers } from './session-types'

const adapters: HarnessAdapter[] = [
  claudeHarness,
  codexHarness
]

const adapterById = new Map<AgentHarnessId, HarnessAdapter>(
  adapters.map((adapter) => [adapter.id, adapter])
)

export function defaultAgentHarness(): AgentHarnessId {
  return normalizeHarness(process.env.AGENT_HARNESS ?? defaultHarness)
}

export function harnessStatuses(): HarnessRuntime[] {
  return harnessDefinitions.map((definition) => {
    const adapter = adapterById.get(definition.id)

    return adapter?.status() ?? {
      id: definition.id,
      label: definition.label,
      live: false,
      state: 'missing',
      detail: 'mock; no server adapter is registered',
      help: [
        `Add server/harnesses/${definition.id}-session.ts and register it in server/harnesses/index.ts.`,
        'Restart the backend after adding the adapter.'
      ]
    }
  })
}

export function isLive(): boolean {
  return harnessStatuses().some((harness) => harness.live)
}

export function createSession(villager: Villager, handlers: SessionHandlers, cwd: string): AgentSession {
  const harness = normalizeHarness(villager.harness ?? defaultAgentHarness())
  const adapter = adapterById.get(harness)

  if (adapter?.isLive()) {
    return adapter.create(villager, handlers, cwd)
  }

  return createMockSession(villager, handlers)
}
