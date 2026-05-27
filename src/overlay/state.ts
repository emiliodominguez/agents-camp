import { createSignal } from 'solid-js'

import { agents, type AgentDescriptor } from '../world'

/**
 * Reactive bridge between the Phaser game and the Solid overlay. The scene
 * pushes updates in through the setters; the overlay reads the signals. Keeping
 * this in one module means the two worlds never reach into each other directly.
 */

const [nearbyAgent, setNearbyAgentSignal] = createSignal<AgentDescriptor | undefined>(undefined)

export { nearbyAgent }

/**
 * Record which agent the player is standing next to, resolving the id to its
 * descriptor for the overlay to display.
 *
 * @param agentId - The nearby agent's id, or undefined when none is in range.
 */
export function setNearbyAgent(agentId: string | undefined): void {
  if (agentId === undefined) {
    setNearbyAgentSignal(undefined)

    return
  }

  const descriptor = agents.find((agent) => agent.id === agentId)

  setNearbyAgentSignal(descriptor)
}
