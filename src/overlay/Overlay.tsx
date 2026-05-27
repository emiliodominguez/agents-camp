import { Show } from 'solid-js'

import { agents } from '../world'
import { nearbyAgent } from './state'

/**
 * The UI layer drawn over the Phaser canvas: a roster of agents in the office
 * and a contextual prompt when the player stands next to one. The interaction
 * prompt is the seam where proximity chat will attach in a later pass.
 *
 * @returns The overlay UI tree.
 */
export function Overlay() {
  return (
    <>
      <div class="panel roster">
        <h1>Office</h1>

        <ul>
          {agents.map((agent) => (
            <li>
              <span class="dot" style={{ background: agent.dotColor }} />
              {agent.name}
            </li>
          ))}
        </ul>

        <p class="hint">Walk with WASD or the arrow keys.</p>
      </div>

      <Show when={nearbyAgent()}>
        {(agent) => (
          <div class="panel prompt">
            Near <strong>{agent().name}</strong> — press <kbd>E</kbd> to talk
          </div>
        )}
      </Show>
    </>
  )
}
