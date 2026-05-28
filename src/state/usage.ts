import { createSignal } from 'solid-js'

import type { UsageSnapshot } from '../../shared/protocol'

/**
 * The latest usage snapshot from the server. Mirrors what `claude /usage`
 * shows — per-villager turns/tokens, totals, last-active time, and (where
 * the API exposes it) rate-limit info.
 */

const [usage, setUsageSignal] = createSignal<UsageSnapshot | undefined>(undefined)
const [usageOpen, setUsageOpen] = createSignal(false)

export { usage, usageOpen, setUsageOpen }

export function setUsage(next: UsageSnapshot): void {
  setUsageSignal(next)
}
