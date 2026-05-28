import { createEffect, createSignal, For, Show } from 'solid-js'

import { activeTheme } from '../themes'
import {
  requestHistory,
  sendAnswer,
  sendChat,
  sendRemove,
  sendSeed,
  sendSpawn,
  sendUpdate
} from '../services/agentClient'
import { dotColorPalette, personaTemplates } from '../../shared/agents'
import { rosterCollapsed, setRosterCollapsed, villagers } from '../state/roster'
import { setSkillsOpen, skills, skillsOpen } from '../state/skills'
import { setUsageOpen, usage, usageOpen } from '../state/usage'
import type { AgentStatus, ChatLine } from '../../shared/protocol'
import {
  agentStatuses,
  appendPlayerLine,
  awaitingReply,
  chatAgent,
  chatAutoExpandInstructions,
  chatLog,
  closeChat,
  liveMode,
  markQuestionAnswered,
  nearbyAgent,
  nearbyPlot,
  openChat,
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
          <Show when={chatAgent() === undefined && !spawnOpen() && !skillsOpen()}>
            <div class="panel prompt">
              Talk to <strong>{agent.name}</strong> — press <kbd>E</kbd>
            </div>
          </Show>
        )}
      </Show>

      <Show when={nearbyAgent() === undefined && nearbyPlot() !== undefined && !spawnOpen() && !skillsOpen()}>
        <div class="panel prompt">
          Spawn a new villager here — press <kbd>E</kbd>
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
  /** Count of villagers currently 'working' or 'talking' (anything not idle). */
  const busyCount = (): number => {
    const statuses = agentStatuses()

    return villagers().filter((v) => (statuses[v.id] ?? 'idle') !== 'idle').length
  }

  /** Total turns the camp has racked up across all villagers. */
  const totalTurns = (): number => usage()?.totals.turns ?? 0

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
    <div class="panel roster" classList={{ collapsed: rosterCollapsed() }}>
      <button
        type="button"
        class="roster-header"
        onClick={toggle}
        aria-expanded={!rosterCollapsed()}
        aria-label={rosterCollapsed() ? 'Expand roster' : 'Collapse roster'}
      >
        <span class="chevron" aria-hidden="true">{rosterCollapsed() ? '▸' : '▾'}</span>
        <span class="roster-title">{activeTheme.name}</span>
        <span class="roster-summary">
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
        <span class="header-conn" classList={{ live: liveMode() }} title={liveMode() ? 'Live Claude' : 'Mock mode'} />
      </button>

      <Show when={!rosterCollapsed()}>
        <div class="roster-body">
          <Show
            when={villagers().length > 0}
            fallback={
              <div class="roster-empty">
                <p>Your camp is empty.</p>
                <p class="hint">
                  Walk to a glowing <span class="plus">+</span> and press <kbd>E</kbd> to spawn your own villager, or:
                </p>
                <button type="button" class="roster-seed" onClick={() => sendSeed()}>
                  + Seed starter villagers
                </button>
                <p class="hint">(Planner, Builder, Reviewer, Explorer)</p>
              </div>
            }
          >
            <ul class="roster-list">
              <For each={villagers()}>
                {(villager) => <RosterRow
                  villager={villager}
                  onChat={() => openVillagerChat(villager.id)}
                  onEdit={() => editVillager(villager.id)}
                  onRemove={() => removeVillagerById(villager.id, villager.name)}
                />}
              </For>
            </ul>

            <p class="hint">Walk with WASD or click a villager to talk.</p>
          </Show>

          <p class="conn" classList={{ live: liveMode() }}>
            <span class="conn-dot" />
            {liveMode() ? 'Agents live (Claude)' : 'Agents in mock mode'}
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
      </Show>
    </div>
  )
}

/** One villager row in the roster — avatar, name, status, inline controls. */
function RosterRow(props: {
  villager: import('../../shared/agents').Villager
  onChat: () => void
  onEdit: () => void
  onRemove: () => void
}) {
  const spec = (): import('../themes/types').CharacterSpec | undefined =>
    activeTheme.characters.find((c) => c.key === props.villager.sprite)

  const status = (): AgentStatus => agentStatuses()[props.villager.id] ?? 'idle'

  return (
    <li class="roster-row" classList={{ [status()]: true }}>
      <button type="button" class="roster-row-main" onClick={props.onChat} title={`Talk to ${props.villager.name}`}>
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
          <span class="roster-dot" style={{ background: props.villager.dotColor }} />
        </span>
        <span class="roster-row-meta">
          <span class="name">{props.villager.name}</span>
          <span class={`status ${status()}`}>{statusWord[status()]}</span>
        </span>
      </button>

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

  // Consume the auto-expand-instructions hint (set by the roster edit button)
  // exactly once, then clear it so it doesn't leak into the next chat.
  if (chatAutoExpandInstructions()) {
    setChatAutoExpandInstructions(false)
  }

  // Ask the server for the saved transcript on open.
  createEffect(() => {
    requestHistory(agentId)
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
    sendChat(agentId, value)

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
    sendUpdate(agentId, { name: draftName(), persona: draftPersona() })
    setEditing(false)
  }

  return (
    <div class="panel chat">
      <header>
        <span class="dot" style={{ background: agent().dotColor }} />
        <strong>{agent().name}</strong>
        <span class="header-status">{statusWord[agentStatuses()[agentId] ?? 'idle']}</span>
        <button
          type="button"
          class="instructions-toggle"
          onClick={() => setInstructionsOpen((v) => !v)}
          aria-label="Toggle instructions"
        >
          {instructionsOpen() ? '▾ Instructions' : '▸ Instructions'}
        </button>
        <button type="button" class="remove" onClick={remove} aria-label="Remove villager">
          Remove
        </button>
        <button type="button" class="close" onClick={closeChat} aria-label="Close chat (Esc)">
          ✕
        </button>
      </header>

      <Show when={instructionsOpen()}>
        <div class="instructions">
          <Show
            when={editing()}
            fallback={
              <>
                <p class="instructions-body">{agent().persona}</p>
                <div class="instructions-actions">
                  <button type="button" class="secondary" onClick={() => { setDraftPersona(agent().persona); setDraftName(agent().name); setEditing(true) }}>
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

      <div class="transcript" ref={(el) => (scroller = el)}>
        <Show when={chatLog().length === 0 && streamingReply() === '' && !awaitingReply()}>
          <p class="empty">Say hello to {agent().name}.</p>
        </Show>

        <For each={chatLog()}>{(line) => <Line line={line} agentName={agent().name} agentId={agentId} />}</For>

        <Show when={awaitingReply()}>
          <div class="line agent thinking">
            <span class="meta"><span class="who">{agent().name}</span></span>
            <span class="text">
              <span class="dots"><span /><span /><span /></span>
            </span>
          </div>
        </Show>

        <Show when={streamingReply() !== ''}>
          <div class="line agent">
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

      <p class="chat-hint"><kbd>Esc</kbd> to close</p>
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

          return (
            <div class={`line ${line.from}`}>
              <span class="meta">
                <span class="who">{line.from === 'you' ? 'You' : props.agentName}</span>
                <span class="time">{formatTime(line.at)}</span>
              </span>
              <span class="text">{line.text}</span>
            </div>
          )
        })()}
      </Show>

      <Show when={props.line.kind === 'tool'}>
        {(() => {
          const line = props.line as Extract<ChatLine, { kind: 'tool' }>

          return (
            <div class="line tool">
              <span class="tool-badge">{line.name}</span>
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
  forest: 'Forest creatures',
  enemies: 'Enemies'
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
  const [toolScope, setToolScope] = createSignal<import('../../shared/agents').ToolScope>('full')
  const [openSection, setOpenSection] = createSignal<string>('villagers')
  const [openTemplateSection, setOpenTemplateSection] = createSignal<string | undefined>(undefined)
  let nameInput: HTMLInputElement | undefined

  queueMicrotask(() => nameInput?.focus())

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
    <div class="panel spawn">
      <header>
        <strong>Spawn a new villager</strong>
        <button type="button" class="close" onClick={() => setSpawnOpen(false)} aria-label="Cancel (Esc)">
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
                    <div class="sprite-picker">
                      <For each={specs}>
                        {(spec) => (
                          <button
                            type="button"
                            class="sprite-option"
                            classList={{ active: sprite() === spec.key }}
                            onClick={() => setSprite(spec.key)}
                            aria-label={spec.label}
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
          <div class="color-picker">
            <For each={dotColorPalette}>
              {(color) => (
                <button
                  type="button"
                  class="color-option"
                  classList={{ active: dotColor() === color }}
                  style={{ background: color }}
                  onClick={() => setDotColor(color)}
                  aria-label={`Colour ${color}`}
                />
              )}
            </For>
          </div>
        </fieldset>

        <fieldset class="spawn-field">
          <legend>Capabilities</legend>
          <div class="scope-picker">
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
              description="Read, write, edit, run shell commands, and invoke skills. Like Claude Code."
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
          <button type="submit">Spawn villager</button>
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
      aria-pressed={props.checked}
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
    <div class="panel skills">
      <header>
        <strong>Skills</strong>
        <span class="skills-count">{skills().length} available</span>
        <button type="button" class="close" onClick={() => setSkillsOpen(false)} aria-label="Close (Esc)">
          ✕
        </button>
      </header>

      <p class="skills-hint">
        Villagers can call any of these skills via Claude Code's <code>Skill</code> tool.
      </p>

      <ul class="skills-list">
        <For each={skills()} fallback={<li class="skills-empty">No skills found.</li>}>
          {(skill) => (
            <li>
              <span class="skill-name">/{skill.name}</span>
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
    return '—'
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
    <div class="panel usage">
      <header>
        <strong>API usage</strong>
        <span class="usage-subtitle">Subscription path — no per-call dollar cost from the API.</span>
        <button type="button" class="close" onClick={() => setUsageOpen(false)} aria-label="Close (Esc)">
          ✕
        </button>
      </header>

      <Show
        when={usage() && (usage()?.villagers.length ?? 0) > 0}
        fallback={<p class="usage-empty">No usage yet — talk to a villager to start counting.</p>}
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
                  <span class="usage-stat-label">Cache create</span>
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
                      <div class="usage-name">{entry.name}</div>
                      <div class="usage-meta">
                        <span>{entry.turns} turn{entry.turns === 1 ? '' : 's'}</span>
                        <span class="usage-dot">·</span>
                        <span title="input tokens">↑ {formatTokens(entry.inputTokens)}</span>
                        <span class="usage-dot">·</span>
                        <span title="output tokens">↓ {formatTokens(entry.outputTokens)}</span>
                        <Show when={entry.cacheReadTokens > 0}>
                          <span class="usage-dot">·</span>
                          <span title="cache read">⚡ {formatTokens(entry.cacheReadTokens)}</span>
                        </Show>
                        <span class="usage-dot">·</span>
                        <span class="usage-ago">{formatAgo(entry.lastActiveAt)}</span>
                      </div>
                    </li>
                  )}
                </For>
              </ul>

              <p class="usage-hint">
                Token totals are cumulative since the server first counted. Cache reads draw on Claude's prompt-cache,
                which can dramatically reduce input cost on repeat turns.
              </p>
            </>
          )
        })()}
      </Show>
    </div>
  )
}
