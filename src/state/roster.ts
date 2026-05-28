import { createSignal } from 'solid-js'

import type { Villager } from '../../shared/agents'

/**
 * The live roster, mirrored from the server. The agent client populates this
 * from the `roster`/`spawned`/`removed` messages it receives; everyone else
 * reads it through the signal so updates flow reactively into the overlay and
 * the scene.
 */

const [villagers, setVillagers] = createSignal<Villager[]>([])

export { villagers }

/** Replace the entire roster (sent on connect). */
export function setRoster(next: Villager[]): void {
  setVillagers(next)
}

/** Append a newly-spawned villager. */
export function addVillager(villager: Villager): void {
  setVillagers((current) => (current.some((v) => v.id === villager.id) ? current : [...current, villager]))
}

/** Remove a villager by id. */
export function removeVillager(agentId: string): void {
  setVillagers((current) => current.filter((villager) => villager.id !== agentId))
}

/**
 * Look up a villager by id from the current roster snapshot.
 *
 * @param id - The villager's id.
 * @returns The villager, or undefined.
 */
export function villagerById(id: string): Villager | undefined {
  return villagers().find((villager) => villager.id === id)
}
