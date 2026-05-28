import { createSignal } from 'solid-js'

import type { UsageSnapshot } from '../../shared/protocol'

/**
 * The latest usage snapshot from the server: per-villager turns/tokens, totals,
 * and last-active time. Some harnesses report turns without token counts.
 */

const [usage, setUsageSignal] = createSignal<UsageSnapshot | undefined>(undefined)
const [usageOpen, setUsageOpen] = createSignal(false)

export { usage, usageOpen, setUsageOpen }

export function setUsage(next: UsageSnapshot): void {
  setUsageSignal(next)
}
