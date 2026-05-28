import { createSignal } from 'solid-js'

import type { SkillSummary } from '../../shared/protocol'

/**
 * The skills the villagers can call, mirrored from the server.
 */

const [skills, setSkillsSignal] = createSignal<SkillSummary[]>([])
const [skillsOpen, setSkillsOpen] = createSignal(false)

export { skills, skillsOpen, setSkillsOpen }

export function setSkills(next: SkillSummary[]): void {
  setSkillsSignal(next)
}
