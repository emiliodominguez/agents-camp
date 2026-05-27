import { createEffect, For, Show } from 'solid-js'

import { activeTheme } from '../themes'
import { sendChat } from '../services/agentClient'
import { agents } from '../world'
import { appendPlayerLine, chatAgent, chatLog, closeChat, liveMode, nearbyAgent, streamingReply } from './state'

/**
 * The UI layer drawn over the Phaser canvas: a roster of agents in the camp, a
 * contextual prompt when the player stands next to one, and a chat panel that
 * opens when they press E to talk. Chat messages stream in live from the agent
 * backend.
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
            {(agent) => (
              <li>
                <span class="dot" style={{ background: agent.dotColor }} />
                {agent.name}
              </li>
            )}
          </For>
        </ul>

        <p class="hint">Walk with WASD or the arrow keys.</p>
        <p class="hint">{liveMode() ? 'Agents: live (Claude)' : 'Agents: mock replies'}</p>
      </div>

      <Show when={nearbyAgent()} keyed>
        {(agent) => (
          <Show when={chatAgent() === undefined}>
            <div class="panel prompt">
              Near <strong>{agent.name}</strong> — press <kbd>E</kbd> to talk
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
              <button type="button" class="close" onClick={closeChat} aria-label="Close chat">
                ✕
              </button>
            </header>

            <div class="transcript" ref={scroller}>
              <For each={chatLog()}>
                {(line) => (
                  <div class={`line ${line.from}`}>
                    <span class="who">{line.from === 'you' ? 'You' : agent.name}</span>
                    <span class="text">{line.text}</span>
                  </div>
                )}
              </For>

              <Show when={streamingReply() !== ''}>
                <div class="line agent">
                  <span class="who">{agent.name}</span>
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
          </div>
        )}
      </Show>
    </>
  )
}
