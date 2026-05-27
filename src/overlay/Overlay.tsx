import { createEffect, For, Show } from 'solid-js'

import { activeTheme } from '../themes'
import { sendChat } from '../services/agentClient'
import { agents } from '../world'
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
  streamingReply
} from './state'

/** Short status word shown beside each agent in the roster. */
const statusWord: Record<AgentStatus, string> = {
  idle: 'idle',
  working: 'working…',
  talking: 'talking…'
}

/**
 * Format an epoch-millisecond timestamp as a short HH:MM label.
 *
 * @param at - Epoch milliseconds.
 * @returns The formatted time.
 */
function formatTime(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/**
 * The UI layer drawn over the Phaser canvas: a roster showing each agent's live
 * status, a contextual prompt when the player stands next to one, and a chat
 * panel that opens on E. Replies stream in token by token; history is restored
 * from the previous session.
 *
 * @returns The overlay UI tree.
 */
export function Overlay() {
  let scroller: HTMLDivElement | undefined
  let input: HTMLInputElement | undefined

  // Keep the transcript scrolled to the newest line as it grows.
  createEffect(() => {
    chatLog()
    streamingReply()
    awaitingReply()

    if (scroller !== undefined) {
      scroller.scrollTop = scroller.scrollHeight
    }
  })

  // Focus the input whenever a chat opens.
  createEffect(() => {
    if (chatAgent() !== undefined) {
      queueMicrotask(() => input?.focus())
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
          <For each={agents}>
            {(agent) => {
              const status = (): AgentStatus => agentStatuses()[agent.id] ?? 'idle'

              return (
                <li>
                  <span class="dot" classList={{ active: status() !== 'idle' }} style={{ background: agent.dotColor }} />
                  <span class="name">{agent.name}</span>
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
          <Show when={chatAgent() === undefined}>
            <div class="panel prompt">
              Talk to <strong>{agent.name}</strong> — press <kbd>E</kbd>
            </div>
          </Show>
        )}
      </Show>

      <Show when={chatAgent()} keyed>
        {(agent) => (
          <div class="panel chat">
            <header>
              <span class="dot" style={{ background: agent.dotColor }} />
              <strong>{agent.name}</strong>
              <span class="header-status">{statusWord[agentStatuses()[agent.id] ?? 'idle']}</span>
              <button type="button" class="close" onClick={closeChat} aria-label="Close chat (Esc)">
                ✕
              </button>
            </header>

            <div class="transcript" ref={scroller}>
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

            <form class="composer" onSubmit={submit}>
              <input
                ref={input}
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
        )}
      </Show>
    </>
  )
}
