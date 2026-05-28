import { createEffect, createSignal, For, Show } from 'solid-js'

import { activeTheme } from '../themes'
import {
  requestHistory,
  sendAnswer,
  sendChat,
  sendRemove,
  sendSpawn,
  sendUpdate
} from '../services/agentClient'
import { villagers } from '../state/roster'
import { setSkillsOpen, skills, skillsOpen } from '../state/skills'
import type { AgentStatus, ChatLine } from '../../shared/protocol'
import {
  agentStatuses,
  appendPlayerLine,
  awaitingReply,
  chatAgent,
  chatLog,
  closeChat,
  liveMode,
  markQuestionAnswered,
  nearbyAgent,
  nearbyPlot,
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
    </>
  )
}

/** The top-left roster panel — live status per villager + skills button. */
function RosterPanel() {
  return (
    <div class="panel roster">
      <h1>{activeTheme.name}</h1>

      <ul>
        <For each={villagers()}>
          {(villager) => {
            const status = (): AgentStatus => agentStatuses()[villager.id] ?? 'idle'

            return (
              <li>
                <span class="dot" classList={{ active: status() !== 'idle' }} style={{ background: villager.dotColor }} />
                <span class="name">{villager.name}</span>
                <span class={`status ${status()}`}>{statusWord[status()]}</span>
              </li>
            )
          }}
        </For>
      </ul>

      <p class="hint">Walk with WASD or the arrow keys.</p>
      <p class="conn" classList={{ live: liveMode() }}>
        <span class="conn-dot" />
        {liveMode() ? 'Agents live (Claude)' : 'Agents in mock mode'}
      </p>

      <button type="button" class="roster-action" onClick={() => setSkillsOpen(true)}>
        Skills ({skills().length})
      </button>
    </div>
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
  const [instructionsOpen, setInstructionsOpen] = createSignal(false)
  const [draftPersona, setDraftPersona] = createSignal(props.agent.persona)
  const [draftName, setDraftName] = createSignal(props.agent.name)

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

/** Spawn dialog for adding a new villager on the nearby plot. */
function SpawnDialog() {
  const [name, setName] = createSignal('')
  const [persona, setPersona] = createSignal('')
  const [sprite, setSprite] = createSignal('citizen-3')
  let nameInput: HTMLInputElement | undefined

  queueMicrotask(() => nameInput?.focus())

  const submit = (event: Event): void => {
    event.preventDefault()

    const plot = nearbyPlot()

    if (plot === undefined || name().trim() === '' || persona().trim() === '') {
      return
    }

    sendSpawn(name().trim(), persona().trim(), sprite(), plot)
    setSpawnOpen(false)
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
        <label>
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

        <label>
          <span>Role</span>
          <textarea
            value={persona()}
            onInput={(event) => setPersona(event.currentTarget.value)}
            placeholder="What's their role? e.g. You're focused on writing tests and finding edge cases."
            rows="3"
            required
          />
        </label>

        <label>
          <span>Look</span>
          <div class="sprite-picker">
            <For each={activeTheme.characters}>
              {(spec, index) => (
                <button
                  type="button"
                  class="sprite-option"
                  classList={{ active: sprite() === spec.key }}
                  onClick={() => setSprite(spec.key)}
                  aria-label={`Citizen ${index() + 1}`}
                  title={`Citizen ${index() + 1}`}
                >
                  <img src={`${spec.pathPrefix}-d-idle.png`} alt="" />
                </button>
              )}
            </For>
          </div>
        </label>

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
