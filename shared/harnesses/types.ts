/** Supported agent runtimes. Add new ids here, then add a matching definition and server adapter. */
export type AgentHarnessId = 'claude' | 'codex'

/** UI and prompt metadata for an agent runtime. */
export interface AgentHarnessDefinition {
  id: AgentHarnessId
  label: string
  shortLabel: string
  description: string
}
