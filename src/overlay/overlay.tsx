import { createEffect, createSignal, For, onMount, Show } from 'solid-js'

import { activeTheme } from '../themes'
import {
  requestHistory,
  sendAnswer,
  sendChat,
  sendRemove,
  sendSeed,
  sendSpawn,
  sendUpdate
} from '../services/agent-client'
import { dotColorPalette, personaTemplates, type Villager } from '../../shared/agents'
import { harnessById, harnessDefinitions, normalizeHarness, type AgentHarnessId } from '../../shared/harnesses'
import { rosterCollapsed, setRosterCollapsed, villagers } from '../state/roster'
import { setSkillsOpen, skills, skillsOpen } from '../state/skills'
import { setUsageOpen, usage, usageOpen } from '../state/usage'
import type { AgentStatus, ChatLine, HarnessRuntimeStatus } from '../../shared/protocol'
import {
  agentStatuses,
  agentConnectionState,
  appendPlayerLine,
  awaitingReply,
  chatAgent,
  chatAutoExpandInstructions,
  chatLog,
  closeChat,
  defaultAgentHarness,
  harnessStatuses,
  liveMode,
  markQuestionAnswered,
  nearbyAgent,
  nearbyPlot,
  openChat,
  recordAgentError,
  setChatAutoExpandInstructions,
  setSpawnOpen,
  spawnOpen,
  streamingReply
} from './state'

/** Short status word shown beside each villager in the roster. */
const statusWord: Record<AgentStatus, string> = {
  idle: 'idle',
  working: 'working…',
  talking: 'talking…'
}

function formatTime(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function lineHarnessLabel(harness: AgentHarnessId | undefined): string | undefined {
  return harness === undefined ? undefined : harnessById(normalizeHarness(harness)).shortLabel
}

/**
 * The UI overlay: roster, contextual prompts, the chat panel (with editable
 * instructions, tool-call rendering, and AskUserQuestion option buttons), the
 * spawn dialog, and the skills panel.
 *
 * @returns The overlay UI tree.
 */
export function Overlay() {
  return (
    <>
      <RosterPanel />

      <Show when={nearbyAgent()} keyed>
        {(agent) => (
          <Show when={chatAgent() === undefined && !spawnOpen() && !skillsOpen() && !usageOpen()}>
            <div class="panel prompt" role="status" aria-label={`Talk to ${agent.name}. Press E to open chat.`}>
              Talk to <strong>{agent.name}</strong>
              <span class="sr-only">Press E to open chat.</span>
            </div>
          </Show>
        )}
      </Show>

      <Show when={nearbyAgent() === undefined && nearbyPlot() !== undefined && !spawnOpen() && !skillsOpen() && !usageOpen()}>
        <div class="panel prompt" role="status" aria-label="Create a villager here. Press E to open the form.">
          Create a villager here
          <span class="sr-only">Press E to open the form.</span>
        </div>
      </Show>

      <Show when={chatAgent()} keyed>{(agent) => <ChatPanel agent={agent} />}</Show>
      <Show when={spawnOpen()}><SpawnDialog /></Show>
      <Show when={skillsOpen()}><SkillsPanel /></Show>
      <Show when={usageOpen()}><UsagePanel /></Show>
    </>
  )
}

/**
 * The top-left roster panel. A persistent header bar shows the camp name,
 * a one-line summary (counts + connection), and a chevron toggle. Click the
 * header to collapse the body — the collapsed state is remembered in
 * localStorage. The expanded body lists every villager with a mini avatar,
 * live status, click-to-chat behaviour, and per-row edit/remove controls.
 */
function RosterPanel() {
  const [harnessFilter, setHarnessFilter] = createSignal<AgentHarnessId | 'all'>('all')

  /** Count of villagers currently 'working' or 'talking' (anything not idle). */
  const busyCount = (): number => {
    const statuses = agentStatuses()

    return villagers().filter((v) => (statuses[v.id] ?? 'idle') !== 'idle').length
  }

  const villagerHarness = (villager: Villager): AgentHarnessId =>
    normalizeHarness(villager.harness ?? defaultAgentHarness())

  const harnessAgentCount = (id: AgentHarnessId): number =>
    villagers().filter((villager) => villagerHarness(villager) === id).length

  const filteredVillagers = (): Villager[] => {
    const selected = harnessFilter()

    if (selected === 'all') {
      return villagers()
    }

    return villagers().filter((villager) => villagerHarness(villager) === selected)
  }

  const harnessStatus = (id: AgentHarnessId) =>
    harnessStatuses().find((status) => status.id === id)

  const selectedHarnessLabel = (): string => {
    const selected = harnessFilter()

    return selected === 'all' ? 'all harnesses' : harnessById(selected).label
  }

  /** Total turns the camp has racked up across all villagers. */
  const totalTurns = (): number => usage()?.totals.turns ?? 0

  const liveHarnessNames = (): string[] =>
    harnessStatuses()
      .filter((harness) => harness.live)
      .map((harness) => harness.label)

  const unavailableHarnesses = () => harnessStatuses().filter((harness) => !harness.live)

  const connectionTitle = (): string => {
    if (agentConnectionState() !== 'connected') {
      return 'Agent backend is not connected.'
    }

    return harnessStatuses()
      .map((harness) => `${harness.label}: ${harness.detail}`)
      .join('\n')
  }

  const connectionText = (): string => {
    if (agentConnectionState() === 'connecting') {
      return 'Connecting to backend...'
    }

    if (agentConnectionState() === 'disconnected') {
      return 'Backend disconnected'
    }

    const names = liveHarnessNames()

    if (names.length === 0) {
      return 'Agents in mock mode'
    }

    return `Live harness${names.length === 1 ? '' : 'es'}: ${names.join(', ')}`
  }

  /** Toggle collapsed state. */
  const toggle = (): void => setRosterCollapsed(!rosterCollapsed())

  /** Open a villager's chat from the roster (no walking required). */
  const openVillagerChat = (id: string): void => {
    openChat(id)
  }

  /** Open chat with the instructions panel auto-expanded for editing. */
  const editVillager = (id: string): void => {
    setChatAutoExpandInstructions(true)
    openChat(id)
  }

  /** Remove a villager after confirmation. */
  const removeVillagerById = (id: string, name: string): void => {
    if (window.confirm(`Remove ${name} from the camp?`)) {
      sendRemove(id)
    }
  }

  return (
    <div class="panel roster" classList={{ collapsed: rosterCollapsed() }} role="region" aria-labelledby="roster-title">
      <button
        type="button"
        class="roster-header"
        onClick={toggle}
        aria-expanded={!rosterCollapsed()}
        aria-label={rosterCollapsed() ? 'Expand roster' : 'Collapse roster'}
      >
        <span class="chevron" aria-hidden="true">{rosterCollapsed() ? '▸' : '▾'}</span>
        <span class="roster-title" id="roster-title">{activeTheme.name}</span>
        <span class="roster-summary" id="roster-summary">
          <Show when={villagers().length > 0} fallback={<>empty</>}>
            {villagers().length} villager{villagers().length === 1 ? '' : 's'}
            <Show when={busyCount() > 0}>
              <> · {busyCount()} busy</>
            </Show>
            <Show when={totalTurns() > 0}>
              <> · {totalTurns()} turn{totalTurns() === 1 ? '' : 's'}</>
            </Show>
          </Show>
        </span>
        <span
          class="header-conn"
          classList={{
            live: agentConnectionState() === 'connected' && liveMode(),
            warn: agentConnectionState() !== 'connected' || unavailableHarnesses().length > 0
          }}
          title={connectionTitle()}
          aria-hidden="true"
        />
      </button>

      <Show when={!rosterCollapsed()}>
        <div class="roster-body">
          <Show
            when={villagers().length > 0}
            fallback={
              <div class="roster-empty">
                <p>Your camp is empty.</p>
                <p class="hint">
                  Find a glowing <span class="plus">+</span> plot to spawn your own villager, or:
                </p>
                <button type="button" class="roster-seed" onClick={() => sendSeed()}>
                  + Seed starter villagers
                </button>
                <p class="hint">(Planner, Codex Builder, Reviewer, Explorer)</p>
              </div>
            }
          >
            <div class="harness-filter" role="group" aria-label="Filter roster by harness">
              <button
                type="button"
                class="harness-filter-button"
                classList={{ active: harnessFilter() === 'all' }}
                onClick={() => setHarnessFilter('all')}
                aria-pressed={harnessFilter() === 'all'}
                aria-label={`Show all harnesses, ${villagers().length} agents`}
              >
                <span class="filter-title">All</span>
                <span class="filter-count">{villagers().length}</span>
              </button>
              <For each={harnessDefinitions}>
                {(definition) => {
                  const status = () => harnessStatus(definition.id)
                  const live = () => status()?.live === true

                  return (
                    <button
                      type="button"
                      class="harness-filter-button"
                      classList={{ active: harnessFilter() === definition.id }}
                      onClick={() => setHarnessFilter(definition.id)}
                      title={`${definition.description}\n${status()?.detail ?? 'status pending'}`}
                      aria-pressed={harnessFilter() === definition.id}
                      aria-label={`Show ${definition.label} agents, ${harnessAgentCount(definition.id)} agents, ${live() ? 'live' : 'mock'}`}
                    >
                      <span class="filter-title">
                        <span class="filter-dot" classList={{ live: live() }} aria-hidden="true" />
                        {definition.shortLabel}
                      </span>
                      <span class="filter-count">{harnessAgentCount(definition.id)}</span>
                      <span class="filter-state">{live() ? 'live' : 'mock'}</span>
                    </button>
                  )
                }}
              </For>
            </div>

            <Show
              when={filteredVillagers().length > 0}
              fallback={<p class="roster-filter-empty">No agents on {selectedHarnessLabel()}.</p>}
            >
              <ul class="roster-list">
                <For each={filteredVillagers()}>
                  {(villager) => <RosterRow
                    villager={villager}
                    onChat={() => openVillagerChat(villager.id)}
                    onEdit={() => editVillager(villager.id)}
                    onRemove={() => removeVillagerById(villager.id, villager.name)}
                  />}
                </For>
              </ul>
            </Show>

          </Show>

          <div class="roster-footer">
            <p
              class="conn"
              classList={{
                live: agentConnectionState() === 'connected' && liveMode(),
                warn: agentConnectionState() !== 'connected' || unavailableHarnesses().length > 0
              }}
              id="roster-runtime-status"
            >
              <span class="conn-dot" aria-hidden="true" />
              {connectionText()}
            </p>

            <div class="roster-actions">
              <button type="button" class="roster-action" onClick={() => setSkillsOpen(true)}>
                Skills ({skills().length})
              </button>
              <button type="button" class="roster-action" onClick={() => setUsageOpen(true)}>
                Usage
              </button>
            </div>
          </div>

          <Show when={agentConnectionState() !== 'connected' || unavailableHarnesses().length > 0}>
            <RuntimeNotice unavailableHarnesses={unavailableHarnesses()} />
          </Show>
        </div>
      </Show>
    </div>
  )
}

function RuntimeNotice(props: { unavailableHarnesses: HarnessRuntimeStatus[] }) {
  const title = (): string => {
    if (agentConnectionState() === 'connecting') {
      return 'Connecting to the agent backend'
    }

    if (agentConnectionState() === 'disconnected') {
      return 'Agent backend is offline'
    }

    return 'Some harnesses need attention'
  }

  const summary = (): string => {
    if (agentConnectionState() === 'connecting') {
      return 'The browser is opening the WebSocket connection. If this stays here, start the backend.'
    }

    if (agentConnectionState() === 'disconnected') {
      return 'Run pnpm dev for the full app, or pnpm dev:server if the web server is already running. The browser will reconnect automatically.'
    }

    return 'Unavailable harnesses fall back to mock replies until their local runtime is installed and authenticated.'
  }

  return (
    <div class="runtime-notice" role="status" aria-live="polite">
      <strong>{title()}</strong>
      <p>{summary()}</p>

      <Show when={agentConnectionState() === 'connected' && props.unavailableHarnesses.length > 0}>
        <ul class="runtime-list">
          <For each={props.unavailableHarnesses}>
            {(harness) => (
              <li>
                <span class="runtime-row-title">
                  <span class={`runtime-pill ${harness.state}`}>{harness.state.replace('-', ' ')}</span>
                  {harness.label}
                </span>
                <span class="runtime-detail">{harness.detail}</span>
                <ol>
                  <For each={harness.help}>
                    {(step) => <li>{step}</li>}
                  </For>
                </ol>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </div>
  )
}

/** One villager row in the roster — avatar, name, status, inline controls. */
function RosterRow(props: {
  villager: Villager
  onChat: () => void
  onEdit: () => void
  onRemove: () => void
}) {
  const spec = (): import('../themes/types').CharacterSpec | undefined =>
    activeTheme.characters.find((c) => c.key === props.villager.sprite)

  const status = (): AgentStatus => agentStatuses()[props.villager.id] ?? 'idle'
  const harness = () => harnessById(normalizeHarness(props.villager.harness ?? defaultAgentHarness()))
  const switchHarness = (value: string): void => {
    const next = normalizeHarness(value)

    if (next !== harness().id) {
      sendUpdate(props.villager.id, { harness: next })
    }
  }

  return (
    <li class="roster-row" classList={{ [status()]: true }}>
      <button
        type="button"
        class="roster-row-main"
        onClick={props.onChat}
        title={`Talk to ${props.villager.name}`}
        aria-label={`Talk to ${props.villager.name}, ${harness().label}, ${statusWord[status()]}`}
      >
        <span class="roster-avatar" style={{ background: `${props.villager.dotColor}22` }}>
          <Show when={spec()} keyed>
            {(s) => (
              <span
                class="roster-avatar-frame"
                style={{ '--frame-size': `${s.frameSize}px` }}
              >
                <img src={`${s.pathPrefix}/d${s.idle.suffix}.png`} alt="" />
              </span>
            )}
          </Show>
          <span class="roster-dot" style={{ background: props.villager.dotColor }} aria-hidden="true" />
        </span>
        <span class="roster-row-meta">
          <span class="name-line">
            <span class="name">{props.villager.name}</span>
            <span class="harness-badge">{harness().shortLabel}</span>
          </span>
          <span class={`status ${status()}`}>{statusWord[status()]}</span>
        </span>
      </button>

      <select
        class="roster-harness-select"
        value={harness().id}
        title={`Harness for ${props.villager.name}`}
        aria-label={`Harness for ${props.villager.name}`}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => switchHarness(event.currentTarget.value)}
      >
        <For each={harnessDefinitions}>
          {(definition) => <option value={definition.id}>{definition.shortLabel}</option>}
        </For>
      </select>

      <span class="roster-row-controls">
        <button
          type="button"
          class="roster-row-icon"
          onClick={(event) => { event.stopPropagation(); props.onEdit() }}
          title="Edit instructions"
          aria-label={`Edit ${props.villager.name}'s instructions`}
        >
          ✎
        </button>
        <button
          type="button"
          class="roster-row-icon danger"
          onClick={(event) => { event.stopPropagation(); props.onRemove() }}
          title="Remove villager"
          aria-label={`Remove ${props.villager.name}`}
        >
          ×
        </button>
      </span>
    </li>
  )
}

/**
 * The chat panel — header with editable instructions, transcript (text +
 * tools + questions), composer.
 *
 * @param props.agent - The villager being talked to.
 * @returns The chat panel.
 */
function ChatPanel(props: { agent: NonNullable<ReturnType<typeof chatAgent>> }) {
  // Always read the live villager from the roster so edits surface immediately
  // (the `agent` prop is a snapshot from when the chat opened).
  const agent = (): NonNullable<ReturnType<typeof chatAgent>> =>
    villagers().find((v) => v.id === props.agent.id) ?? props.agent
  const agentId = props.agent.id
  let scroller: HTMLDivElement | undefined
  let input: HTMLInputElement | undefined

  const [editing, setEditing] = createSignal(false)
  const [instructionsOpen, setInstructionsOpen] = createSignal(chatAutoExpandInstructions())
  const [draftPersona, setDraftPersona] = createSignal(props.agent.persona)
  const [draftName, setDraftName] = createSignal(props.agent.name)
  const [draftHarness, setDraftHarness] = createSignal<AgentHarnessId>(
    normalizeHarness(props.agent.harness ?? defaultAgentHarness())
  )
  const activeHarness = () => harnessById(normalizeHarness(agent().harness ?? defaultAgentHarness()))
  const chatSpec = () => activeTheme.characters.find((character) => character.key === agent().sprite)

  // Consume the auto-expand-instructions hint (set by the roster edit button)
  // exactly once, then clear it so it doesn't leak into the next chat.
  if (chatAutoExpandInstructions()) {
    setChatAutoExpandInstructions(false)
  }

  // Ask the server for the saved transcript on open.
  createEffect(() => {
    requestHistory(agentId)
  })

  onMount(() => {
    queueMicrotask(() => input?.focus())
  })

  // Keep the transcript scrolled to the newest line.
  createEffect(() => {
    chatLog()
    streamingReply()
    awaitingReply()

    if (scroller !== undefined) {
      scroller.scrollTop = scroller.scrollHeight
    }
  })

  const submit = (event: Event): void => {
    event.preventDefault()

    const value = input?.value.trim() ?? ''

    if (value === '') {
      return
    }

    appendPlayerLine(value)

    if (!sendChat(agentId, value)) {
      recordAgentError(agentId, 'The agent backend is not connected. Start it with pnpm dev or pnpm dev:server, then retry.')
    }

    if (input !== undefined) {
      input.value = ''
    }
  }

  const remove = (): void => {
    if (window.confirm(`Remove ${agent().name} from the camp?`)) {
      sendRemove(agentId)
      closeChat()
    }
  }

  const saveEdits = (): void => {
    sendUpdate(agentId, { name: draftName(), persona: draftPersona(), harness: draftHarness() })
    setEditing(false)
  }

  return (
    <div class="panel chat" role="dialog" aria-labelledby="chat-title">
      <header>
        <span class="chat-agent-summary">
          <span class="chat-avatar" style={{ background: `${agent().dotColor}22` }} aria-hidden="true">
            <Show when={chatSpec()} keyed>
              {(spec) => (
                <span class="chat-avatar-frame" style={{ '--frame-size': `${spec.frameSize}px` }}>
                  <img src={`${spec.pathPrefix}/d${spec.idle.suffix}.png`} alt="" />
                </span>
              )}
            </Show>
            <span class="dot" style={{ background: agent().dotColor }} />
          </span>
          <span class="chat-agent-copy">
            <span class="chat-title-row">
              <strong id="chat-title">{agent().name}</strong>
              <span class="harness-badge">{activeHarness().shortLabel}</span>
            </span>
            <span class="header-status">{activeHarness().label} · {statusWord[agentStatuses()[agentId] ?? 'idle']}</span>
          </span>
        </span>
        <span class="chat-actions">
          <button
            type="button"
            class="instructions-toggle"
            onClick={() => setInstructionsOpen((v) => !v)}
            aria-label="Toggle instructions"
            aria-expanded={instructionsOpen()}
            aria-controls="chat-instructions"
          >
            {instructionsOpen() ? '▾ Instructions' : '▸ Instructions'}
          </button>
          <button type="button" class="remove" onClick={remove} aria-label="Remove villager">
            Remove
          </button>
          <button type="button" class="close" onClick={closeChat} aria-label="Close chat">
            ✕
          </button>
        </span>
      </header>

      <Show when={instructionsOpen()}>
        <div class="instructions" id="chat-instructions">
          <Show
            when={editing()}
            fallback={
              <>
                <p class="instructions-body">{agent().persona}</p>
                <div class="instructions-actions">
                  <button
                    type="button"
                    class="secondary"
                    onClick={() => {
                      setDraftPersona(agent().persona)
                      setDraftName(agent().name)
                      setDraftHarness(normalizeHarness(agent().harness ?? defaultAgentHarness()))
                      setEditing(true)
                    }}
                  >
                    Edit
                  </button>
                </div>
              </>
            }
          >
            <label>
              <span>Name</span>
              <input type="text" value={draftName()} onInput={(e) => setDraftName(e.currentTarget.value)} />
            </label>
            <label>
              <span>Harness</span>
              <select
                value={draftHarness()}
                onChange={(e) => setDraftHarness(normalizeHarness(e.currentTarget.value))}
              >
                <For each={harnessDefinitions}>
                  {(harness) => <option value={harness.id}>{harness.label}</option>}
                </For>
              </select>
            </label>
            <label>
              <span>Instructions</span>
              <textarea
                rows="4"
                value={draftPersona()}
                onInput={(e) => setDraftPersona(e.currentTarget.value)}
              />
            </label>
            <div class="instructions-actions">
              <button type="button" class="secondary" onClick={() => setEditing(false)}>
                Cancel
              </button>
              <button type="button" onClick={saveEdits}>
                Save
              </button>
            </div>
          </Show>
        </div>
      </Show>

      <div
        class="transcript"
        ref={(el) => (scroller = el)}
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
        aria-label={`Conversation with ${agent().name}`}
      >
        <Show when={chatLog().length === 0 && streamingReply() === '' && !awaitingReply()}>
          <p class="empty">Say hello to {agent().name}.</p>
        </Show>

        <For each={chatLog()}>{(line) => <Line line={line} agentName={agent().name} agentId={agentId} />}</For>

        <Show when={awaitingReply()}>
          <div class="line message agent thinking" role="status" aria-label={`${agent().name} is thinking`}>
            <span class="meta"><span class="who">{agent().name}</span></span>
            <span class="text">
              <span class="dots" aria-hidden="true"><span /><span /><span /></span>
            </span>
          </div>
        </Show>

        <Show when={streamingReply() !== ''}>
          <div class="line message agent streaming">
            <span class="meta"><span class="who">{agent().name}</span></span>
            <span class="text">
              {streamingReply()}
              <span class="cursor" aria-hidden="true">▋</span>
            </span>
          </div>
        </Show>
      </div>

      <form class="composer" onSubmit={submit}>
        <input
          ref={(el) => (input = el)}
          type="text"
          placeholder={`Say something to ${agent().name}…`}
          autocomplete="off"
          aria-label={`Message ${agent().name}`}
        />
        <button type="submit">Send</button>
      </form>
    </div>
  )
}

/** Render one transcript line — text, tool call, or question. */
function Line(props: { line: ChatLine; agentName: string; agentId: string }) {
  return (
    <>
      <Show when={props.line.kind === 'message'}>
        {(() => {
          const line = props.line as Extract<ChatLine, { kind: 'message' }>
          const harness = line.from === 'agent' ? lineHarnessLabel(line.harness) : undefined

          return (
            <div class={`line message ${line.from}`}>
              <span class="meta">
                <span class="who">{line.from === 'you' ? 'You' : props.agentName}</span>
                <Show when={harness}>{(label) => <span class="line-harness">{label()}</span>}</Show>
                <time class="time" dateTime={new Date(line.at).toISOString()}>{formatTime(line.at)}</time>
              </span>
              <span class="text">{line.text}</span>
            </div>
          )
        })()}
      </Show>

      <Show when={props.line.kind === 'tool'}>
        {(() => {
          const line = props.line as Extract<ChatLine, { kind: 'tool' }>
          const harness = lineHarnessLabel(line.harness)

          return (
            <div class="line tool">
              <span class="tool-meta">
                <span class="tool-badge">{line.name}</span>
                <Show when={harness}>{(label) => <span class="line-harness">{label()}</span>}</Show>
              </span>
              <span class="tool-summary">{line.summary}</span>
            </div>
          )
        })()}
      </Show>

      <Show when={props.line.kind === 'question'}>
        {(() => {
          const line = props.line as Extract<ChatLine, { kind: 'question' }>

          return <QuestionLine line={line} agentName={props.agentName} agentId={props.agentId} />
        })()}
      </Show>

      <Show when={props.line.kind === 'error'}>
        {(() => {
          const line = props.line as Extract<ChatLine, { kind: 'error' }>
          const harness = lineHarnessLabel(line.harness)

          return (
            <div class="line error" role="alert">
              <span class="meta">
                <span class="who">System</span>
                <Show when={harness}>{(label) => <span class="line-harness">{label()}</span>}</Show>
                <time class="time" dateTime={new Date(line.at).toISOString()}>{formatTime(line.at)}</time>
              </span>
              <span class="text">{line.message}</span>
            </div>
          )
        })()}
      </Show>
    </>
  )
}

/** Render a multi-choice question with clickable option buttons. */
function QuestionLine(props: {
  line: Extract<ChatLine, { kind: 'question' }>
  agentName: string
  agentId: string
}) {
  const [selected, setSelected] = createSignal<string[]>([])

  const pick = (label: string): void => {
    if (props.line.question.answered !== undefined) {
      return
    }

    if (props.line.question.multiSelect) {
      setSelected((current) =>
        current.includes(label) ? current.filter((value) => value !== label) : [...current, label]
      )
    } else {
      submit([label])
    }
  }

  const submit = (picks: string[]): void => {
    if (picks.length === 0) {
      return
    }

    sendAnswer(props.agentId, props.line.question.toolUseId, picks)
    markQuestionAnswered(props.line.question.toolUseId, picks)
  }

  return (
    <div class="line question">
      <span class="meta">
        <span class="who">{props.agentName}</span>
        <Show when={lineHarnessLabel(props.line.harness)}>{(label) => <span class="line-harness">{label()}</span>}</Show>
        <span class="time">{formatTime(props.line.at)}</span>
      </span>
      <div class="question-body">
        <Show when={props.line.question.header}>
          {(header) => <span class="question-header">{header()}</span>}
        </Show>
        <p class="question-text">{props.line.question.question}</p>

        <div class="question-options">
          <For each={props.line.question.options}>
            {(option) => {
              const isAnswer = (): boolean => props.line.question.answered?.includes(option.label) === true
              const isSelected = (): boolean => selected().includes(option.label)
              const disabled = (): boolean => props.line.question.answered !== undefined

              return (
                <button
                  type="button"
                  class="question-option"
                  classList={{ answer: isAnswer(), selected: isSelected() }}
                  disabled={disabled()}
                  onClick={() => pick(option.label)}
                  aria-pressed={isSelected() || isAnswer()}
                >
                  <span class="option-label">{option.label}</span>
                  <Show when={option.description}>{(d) => <span class="option-desc">{d()}</span>}</Show>
                </button>
              )
            }}
          </For>
        </div>

        <Show when={props.line.question.multiSelect && props.line.question.answered === undefined}>
          <button type="button" class="question-submit" disabled={selected().length === 0} onClick={() => submit(selected())}>
            Submit answer{selected().length > 1 ? 's' : ''}
          </button>
        </Show>
      </div>
    </div>
  )
}

/** Human-readable label for each character category. */
const categoryLabel: Record<import('../themes/types').CharacterCategory, string> = {
  villagers: 'Villagers',
  archers: 'Guards',
  forest: 'Forest creatures'
}

/** Human-readable label for each persona-template category. */
const templateCategoryLabel: Record<import('../../shared/agents').PersonaTemplate['category'], string> = {
  engineering: 'Engineering',
  design: 'Design',
  product: 'Product',
  support: 'Support',
  fun: 'Fun'
}

/** Group characters or templates by their category, preserving insertion order. */
function groupBy<T, K extends string>(items: T[], getCategory: (item: T) => K): Array<[K, T[]]> {
  const groups: Array<[K, T[]]> = []
  const indexByKey = new Map<K, number>()

  for (const item of items) {
    const key = getCategory(item)
    const found = indexByKey.get(key)

    if (found === undefined) {
      indexByKey.set(key, groups.length)
      groups.push([key, [item]])
    } else {
      const bucket = groups[found]
      if (bucket !== undefined) {
        bucket[1].push(item)
      }
    }
  }

  return groups
}

/**
 * Spawn dialog for adding a new villager on the nearby plot. Offers a
 * categorised sprite picker, a persona template library, a dot-colour
 * palette, a tool-scope selector, and a live animated sprite preview.
 */
function SpawnDialog() {
  const [name, setName] = createSignal('')
  const [persona, setPersona] = createSignal('')
  const [sprite, setSprite] = createSignal('citizen-1')
  const [dotColor, setDotColor] = createSignal(dotColorPalette[0] ?? '#7c9cff')
  const [harness, setHarness] = createSignal<AgentHarnessId>(defaultAgentHarness())
  const [toolScope, setToolScope] = createSignal<import('../../shared/agents').ToolScope>('full')
  const [openSection, setOpenSection] = createSignal<string>('villagers')
  const [openTemplateSection, setOpenTemplateSection] = createSignal<string | undefined>(undefined)
  let nameInput: HTMLInputElement | undefined

  onMount(() => {
    queueMicrotask(() => nameInput?.focus())
  })

  const characterGroups = groupBy(activeTheme.characters, (c) => c.category)
  const templateGroups = groupBy(personaTemplates, (template) => template.category)

  /** The currently-selected character spec (for the preview). */
  const selectedSpec = () => activeTheme.characters.find((c) => c.key === sprite())

  const submit = (event: Event): void => {
    event.preventDefault()

    const plot = nearbyPlot()

    if (plot === undefined || name().trim() === '' || persona().trim() === '') {
      return
    }

    sendSpawn({
      name: name().trim(),
      persona: persona().trim(),
      sprite: sprite(),
      tile: plot,
      dotColor: dotColor(),
      harness: harness(),
      toolScope: toolScope()
    })
    setSpawnOpen(false)
  }

  const applyTemplate = (templateId: string): void => {
    const template = personaTemplates.find((t) => t.id === templateId)

    if (template === undefined) {
      return
    }

    setPersona(template.role)

    if (name().trim() === '') {
      setName(template.suggestedName)
    }
  }

  return (
    <div class="panel spawn" role="dialog" aria-modal="true" aria-labelledby="spawn-title">
      <header>
        <strong id="spawn-title">Create a new villager</strong>
        <button type="button" class="close" onClick={() => setSpawnOpen(false)} aria-label="Cancel">
          ✕
        </button>
      </header>

      <form onSubmit={submit}>
        <div class="spawn-row">
          <label class="spawn-name">
            <span>Name</span>
            <input
              ref={(el) => (nameInput = el)}
              type="text"
              value={name()}
              onInput={(event) => setName(event.currentTarget.value)}
              placeholder="e.g. Tester"
              autocomplete="off"
              required
            />
          </label>

          <SpritePreview spec={selectedSpec()} tint={dotColor()} />
        </div>

        <fieldset class="spawn-field">
          <legend>Choose a look</legend>
          <div class="spawn-sections">
            <For each={characterGroups}>
              {([categoryKey, specs]) => {
                const isOpen = (): boolean => openSection() === categoryKey

                return (
                  <details class="spawn-section" open={isOpen()}>
                    <summary
                      onClick={(event) => {
                        event.preventDefault()
                        setOpenSection(isOpen() ? '' : categoryKey)
                      }}
                    >
                      <span class="section-title">{categoryLabel[categoryKey]}</span>
                      <span class="section-count">{specs.length}</span>
                    </summary>
                    <div class="sprite-picker" role="radiogroup" aria-label={`${categoryLabel[categoryKey]} looks`}>
                      <For each={specs}>
                        {(spec) => (
                          <button
                            type="button"
                            class="sprite-option"
                            classList={{ active: sprite() === spec.key }}
                            onClick={() => setSprite(spec.key)}
                            aria-label={spec.label}
                            aria-checked={sprite() === spec.key}
                            role="radio"
                            title={spec.label}
                          >
                            <img src={`${spec.pathPrefix}/d${spec.idle.suffix}.png`} alt="" style={{ '--frame-size': `${spec.frameSize}px` }} />
                            <span class="sprite-label">{spec.label}</span>
                          </button>
                        )}
                      </For>
                    </div>
                  </details>
                )
              }}
            </For>
          </div>
        </fieldset>

        <fieldset class="spawn-field">
          <legend>Roster colour</legend>
          <div class="color-picker" role="radiogroup" aria-label="Roster color">
            <For each={dotColorPalette}>
              {(color) => (
                <button
                  type="button"
                  class="color-option"
                  classList={{ active: dotColor() === color }}
                  style={{ background: color }}
                  onClick={() => setDotColor(color)}
                  aria-label={`Color ${color}`}
                  aria-checked={dotColor() === color}
                  role="radio"
                />
              )}
            </For>
          </div>
        </fieldset>

        <fieldset class="spawn-field">
          <legend>Harness</legend>
          <div class="scope-picker" role="radiogroup" aria-label="Harness">
            <For each={harnessDefinitions}>
              {(definition) => (
                <ScopeOption
                  value={definition.id}
                  label={definition.label}
                  description={definition.description}
                  checked={harness() === definition.id}
                  onSelect={() => setHarness(definition.id)}
                />
              )}
            </For>
          </div>
        </fieldset>

        <fieldset class="spawn-field">
          <legend>Capabilities</legend>
          <div class="scope-picker" role="radiogroup" aria-label="Capabilities">
            <ScopeOption
              value="conversational"
              label="Conversational"
              description="Chat only. No file or shell tools."
              checked={toolScope() === 'conversational'}
              onSelect={() => setToolScope('conversational')}
            />
            <ScopeOption
              value="read-only"
              label="Read-only"
              description="Can browse and search files in their workspace, but not change them."
              checked={toolScope() === 'read-only'}
              onSelect={() => setToolScope('read-only')}
            />
            <ScopeOption
              value="full"
              label="Full coding"
              description="Read, write, edit, and run shell commands through the selected harness."
              checked={toolScope() === 'full'}
              onSelect={() => setToolScope('full')}
            />
          </div>
        </fieldset>

        <fieldset class="spawn-field">
          <legend>Role / instructions</legend>
          <div class="spawn-sections">
            <For each={templateGroups}>
              {([categoryKey, templates]) => {
                const isOpen = (): boolean => openTemplateSection() === categoryKey

                return (
                  <details class="spawn-section template-section" open={isOpen()}>
                    <summary
                      onClick={(event) => {
                        event.preventDefault()
                        setOpenTemplateSection(isOpen() ? undefined : categoryKey)
                      }}
                    >
                      <span class="section-title">{templateCategoryLabel[categoryKey]}</span>
                      <span class="section-count">{templates.length}</span>
                    </summary>
                    <div class="template-picker">
                      <For each={templates}>
                        {(template) => (
                          <button
                            type="button"
                            class="template-option"
                            onClick={() => applyTemplate(template.id)}
                            title={template.role}
                            aria-label={`Use ${template.name} template`}
                          >
                            {template.name}
                          </button>
                        )}
                      </For>
                    </div>
                  </details>
                )
              }}
            </For>
          </div>
          <textarea
            class="spawn-persona"
            value={persona()}
            onInput={(event) => setPersona(event.currentTarget.value)}
            placeholder="Write a role, or pick a template above. e.g. You focus on writing tests and finding edge cases."
            rows="4"
            required
          />
        </fieldset>

        <div class="spawn-actions">
          <button type="button" class="secondary" onClick={() => setSpawnOpen(false)}>
            Cancel
          </button>
          <button type="submit">Create villager</button>
        </div>
      </form>
    </div>
  )
}

/** A radio-style capability option in the spawn dialog. */
function ScopeOption(props: {
  value: string
  label: string
  description: string
  checked: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      class="scope-option"
      classList={{ active: props.checked }}
      onClick={props.onSelect}
      role="radio"
      aria-checked={props.checked}
    >
      <span class="scope-radio" aria-hidden="true" />
      <span class="scope-meta">
        <span class="scope-label">{props.label}</span>
        <span class="scope-description">{props.description}</span>
      </span>
    </button>
  )
}

/**
 * Live animated preview of the chosen sprite. Cycles the d-idle strip with a
 * CSS step-animation so you see a moving character without spinning up Phaser.
 *
 * @param props.spec - The chosen character spec, or undefined.
 * @param props.tint - The dot colour used as a subtle background tint.
 * @returns The preview pane.
 */
function SpritePreview(props: {
  spec: import('../themes/types').CharacterSpec | undefined
  tint: string
}) {
  return (
    <div class="sprite-preview" style={{ background: `${props.tint}22` }}>
      <Show when={props.spec} fallback={<div class="sprite-preview-empty">Pick a look</div>} keyed>
        {(spec) => (
          <>
            <div
              class="sprite-preview-frame"
              style={{
                '--frame-size': `${spec.frameSize}px`,
                '--frames': spec.idle.frames
              }}
            >
              <img src={`${spec.pathPrefix}/d${spec.idle.suffix}.png`} alt={spec.label} />
            </div>
            <span class="sprite-preview-label">{spec.label}</span>
          </>
        )}
      </Show>
    </div>
  )
}

/** Skills panel — list every skill the villagers can call. */
function SkillsPanel() {
  return (
    <div class="panel skills" role="dialog" aria-modal="true" aria-labelledby="skills-title" aria-describedby="skills-hint">
      <header>
        <strong id="skills-title">Skills</strong>
        <span class="skills-count">{skills().length} available</span>
        <button type="button" class="close" onClick={() => setSkillsOpen(false)} aria-label="Close skills">
          ✕
        </button>
      </header>

      <p class="skills-hint" id="skills-hint">
        Skills are grouped by the harness that can see them. Claude and Codex read separate skill folders.
      </p>

      <ul class="skills-list">
        <For each={skills()} fallback={<li class="skills-empty">No skills found.</li>}>
          {(skill) => (
            <li>
              <span class="skill-name">/{skill.name}</span>
              <span class="skill-harness">{harnessById(normalizeHarness(skill.harness)).shortLabel}</span>
              <span class={`skill-source ${skill.source}`}>{skill.source}</span>
              <Show when={skill.description}>
                <span class="skill-description">{skill.description}</span>
              </Show>
            </li>
          )}
        </For>
      </ul>
    </div>
  )
}

/** Format a token count with thousands separators. */
function formatTokens(n: number): string {
  return n.toLocaleString('en-US')
}

/** Format ms-ago as "just now" / "5m ago" / "2h ago" / "Mon HH:MM". */
function formatAgo(at: number | undefined): string {
  if (at === undefined) {
    return '-'
  }

  const seconds = Math.floor((Date.now() - at) / 1000)

  if (seconds < 30) return 'just now'
  if (seconds < 90) return '1m ago'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`

  return new Date(at).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })
}

/** API usage panel — per-villager tokens and turns, plus camp totals. */
function UsagePanel() {
  return (
    <div class="panel usage" role="dialog" aria-modal="true" aria-labelledby="usage-title" aria-describedby="usage-subtitle">
      <header>
        <span class="usage-heading">
          <strong id="usage-title">Harness usage</strong>
          <span class="usage-subtitle" id="usage-subtitle">Turn and token counts reported by each runtime.</span>
        </span>
        <button type="button" class="close" onClick={() => setUsageOpen(false)} aria-label="Close usage">
          ✕
        </button>
      </header>

      <Show
        when={usage() && (usage()?.villagers.length ?? 0) > 0}
        fallback={<p class="usage-empty">No usage yet - talk to a villager to start counting.</p>}
      >
        {(() => {
          const snapshot = usage() as NonNullable<ReturnType<typeof usage>>

          return (
            <>
              <div class="usage-totals">
                <div class="usage-stat">
                  <span class="usage-stat-label">Turns</span>
                  <span class="usage-stat-value">{snapshot.totals.turns}</span>
                </div>
                <div class="usage-stat">
                  <span class="usage-stat-label">Input</span>
                  <span class="usage-stat-value">{formatTokens(snapshot.totals.inputTokens)}</span>
                </div>
                <div class="usage-stat">
                  <span class="usage-stat-label">Output</span>
                  <span class="usage-stat-value">{formatTokens(snapshot.totals.outputTokens)}</span>
                </div>
                <div class="usage-stat">
                  <span class="usage-stat-label">Cache new</span>
                  <span class="usage-stat-value">{formatTokens(snapshot.totals.cacheCreateTokens)}</span>
                </div>
                <div class="usage-stat">
                  <span class="usage-stat-label">Cache read</span>
                  <span class="usage-stat-value">{formatTokens(snapshot.totals.cacheReadTokens)}</span>
                </div>
              </div>

              <ul class="usage-list">
                <For each={snapshot.villagers}>
                  {(entry) => (
                    <li>
                      <div class="usage-entry-top">
                        <div class="usage-name">
                          <span class="usage-agent-name">{entry.name}</span>
                          <span class="usage-harness">{harnessById(normalizeHarness(entry.harness)).shortLabel}</span>
                        </div>
                        <span class="usage-ago">{formatAgo(entry.lastActiveAt)}</span>
                      </div>
                      <div class="usage-meta">
                        <span class="usage-metric">
                          <span class="usage-metric-label">Turns</span>
                          <span class="usage-metric-value">{entry.turns}</span>
                        </span>
                        <span class="usage-metric" title="Input tokens">
                          <span class="usage-metric-label">Input</span>
                          <span class="usage-metric-value">{formatTokens(entry.inputTokens)}</span>
                        </span>
                        <span class="usage-metric" title="Output tokens">
                          <span class="usage-metric-label">Output</span>
                          <span class="usage-metric-value">{formatTokens(entry.outputTokens)}</span>
                        </span>
                        <Show when={entry.cacheCreateTokens > 0}>
                          <span class="usage-metric" title="Cache create tokens">
                            <span class="usage-metric-label">Cache new</span>
                            <span class="usage-metric-value">{formatTokens(entry.cacheCreateTokens)}</span>
                          </span>
                        </Show>
                        <Show when={entry.cacheReadTokens > 0}>
                          <span class="usage-metric" title="Cache read tokens">
                            <span class="usage-metric-label">Cache read</span>
                            <span class="usage-metric-value">{formatTokens(entry.cacheReadTokens)}</span>
                          </span>
                        </Show>
                      </div>
                    </li>
                  )}
                </For>
              </ul>

              <p class="usage-hint">
                Token totals are cumulative since the server first counted. Some harnesses do not report token usage;
                those turns still count even when token fields remain zero.
              </p>
            </>
          )
        })()}
      </Show>
    </div>
  )
}
