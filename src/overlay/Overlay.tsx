import { createEffect, createSignal, For, Show } from 'solid-js'

import { activeTheme } from '../themes'
import { requestHistory, sendChat, sendRemove, sendSpawn } from '../services/agentClient'
import { villagers } from '../state/roster'
import type { AgentStatus } from '../../shared/protocol'
import {
  agentStatuses,
  appendPlayerLine,
  awaitingReply,
  chatAgent,
  chatLog,
  closeChat,
  liveMode,
  nearbyAgent,
  nearbyPlot,
  setSpawnOpen,
  spawnOpen,
  streamingReply
} from './state'

/** The seed villagers — these cannot be removed from the UI. */
const seedIds = new Set(['planner', 'builder', 'reviewer', 'explorer'])

/** Short status word shown beside each villager in the roster. */
const statusWord: Record<AgentStatus, string> = {
  idle: 'idle',
  working: 'working…',
  talking: 'talking…'
}

/** Format an epoch-millisecond timestamp as a short HH:MM label. */
function formatTime(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/**
 * The UI layer drawn over the Phaser canvas: a roster of villagers with live
 * status, a contextual prompt when the player stands next to one or an empty
 * plot, a streaming chat panel that opens on E, and a spawn dialog for adding
 * new villagers.
 *
 * @returns The overlay UI tree.
 */
export function Overlay() {
  let scroller: HTMLDivElement | undefined
  let input: HTMLInputElement | undefined

  // Ask the server for the saved transcript whenever the chat agent changes.
  createEffect(() => {
    const agent = chatAgent()

    if (agent !== undefined) {
      requestHistory(agent.id)
      queueMicrotask(() => input?.focus())
    }
  })

  // Keep the transcript scrolled to the newest line as it grows.
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

    const agent = chatAgent()
    const value = input?.value.trim() ?? ''

    if (agent === undefined || value === '') {
      return
    }

    appendPlayerLine(value)
    sendChat(agent.id, value)

    if (input !== undefined) {
      input.value = ''
    }
  }

  return (
    <>
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
      </div>

      <Show when={nearbyAgent()} keyed>
        {(agent) => (
          <Show when={chatAgent() === undefined && !spawnOpen()}>
            <div class="panel prompt">
              Talk to <strong>{agent.name}</strong> — press <kbd>E</kbd>
            </div>
          </Show>
        )}
      </Show>

      <Show when={nearbyAgent() === undefined && nearbyPlot() !== undefined && !spawnOpen()}>
        <div class="panel prompt">
          Spawn a new villager here — press <kbd>E</kbd>
        </div>
      </Show>

      <Show when={chatAgent()} keyed>{(agent) => <ChatPanel agent={agent} scrollerRef={(element) => (scroller = element)} inputRef={(element) => (input = element)} submit={submit} />}</Show>

      <Show when={spawnOpen()}>
        <SpawnDialog />
      </Show>
    </>
  )
}

/**
 * The chat panel for one villager.
 *
 * @param props.agent - The villager being talked to.
 * @param props.scrollerRef - Ref callback for the transcript scroller.
 * @param props.inputRef - Ref callback for the composer input.
 * @param props.submit - Submit handler for the form.
 * @returns The chat panel.
 */
function ChatPanel(props: {
  agent: ReturnType<typeof chatAgent> extends infer T ? (T extends undefined ? never : T) : never
  scrollerRef: (element: HTMLDivElement) => void
  inputRef: (element: HTMLInputElement) => void
  submit: (event: Event) => void
}) {
  const agent = props.agent
  const isSeed = seedIds.has(agent.id)

  const remove = (): void => {
    if (window.confirm(`Remove ${agent.name} from the camp?`)) {
      sendRemove(agent.id)
      closeChat()
    }
  }

  return (
    <div class="panel chat">
      <header>
        <span class="dot" style={{ background: agent.dotColor }} />
        <strong>{agent.name}</strong>
        <span class="header-status">{statusWord[agentStatuses()[agent.id] ?? 'idle']}</span>
        <Show when={!isSeed}>
          <button type="button" class="remove" onClick={remove} aria-label="Remove villager">
            Remove
          </button>
        </Show>
        <button type="button" class="close" onClick={closeChat} aria-label="Close chat (Esc)">
          ✕
        </button>
      </header>

      <div class="transcript" ref={props.scrollerRef}>
        <Show when={chatLog().length === 0 && streamingReply() === '' && !awaitingReply()}>
          <p class="empty">Say hello to {agent.name}.</p>
        </Show>

        <For each={chatLog()}>
          {(line) => (
            <div class={`line ${line.from}`}>
              <span class="meta">
                <span class="who">{line.from === 'you' ? 'You' : agent.name}</span>
                <span class="time">{formatTime(line.at)}</span>
              </span>
              <span class="text">{line.text}</span>
            </div>
          )}
        </For>

        <Show when={awaitingReply()}>
          <div class="line agent thinking">
            <span class="meta">
              <span class="who">{agent.name}</span>
            </span>
            <span class="text">
              <span class="dots">
                <span />
                <span />
                <span />
              </span>
            </span>
          </div>
        </Show>

        <Show when={streamingReply() !== ''}>
          <div class="line agent">
            <span class="meta">
              <span class="who">{agent.name}</span>
            </span>
            <span class="text">
              {streamingReply()}
              <span class="cursor" aria-hidden="true">
                ▋
              </span>
            </span>
          </div>
        </Show>
      </div>

      <form class="composer" onSubmit={props.submit}>
        <input
          ref={props.inputRef}
          type="text"
          placeholder={`Say something to ${agent.name}…`}
          autocomplete="off"
          aria-label={`Message ${agent.name}`}
        />
        <button type="submit">Send</button>
      </form>

      <p class="chat-hint">
        <kbd>Esc</kbd> to close
      </p>
    </div>
  )
}

/** Form for spawning a new villager on the nearby empty plot. */
function SpawnDialog() {
  const [name, setName] = createSignal('')
  const [persona, setPersona] = createSignal('')
  const [sprite, setSprite] = createSignal('citizen-3')
  let nameInput: HTMLInputElement | undefined

  queueMicrotask(() => nameInput?.focus())

  const submit = (event: Event): void => {
    event.preventDefault()

    const plot = nearbyPlot()

    if (plot === undefined) {
      return
    }

    if (name().trim() === '' || persona().trim() === '') {
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
            ref={nameInput}
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
