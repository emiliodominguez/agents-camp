import type { Villager } from '../../shared/agents'
import { harnessById, normalizeHarness } from '../../shared/harnesses'
import type { ChatLine } from '../../shared/protocol'
import type { SessionHandoff } from './session-types'

const maxLines = 14
const maxTextLength = 520

function escapeContext(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function clip(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim()

  if (normalized.length <= maxTextLength) {
    return escapeContext(normalized)
  }

  return `${escapeContext(normalized.slice(0, maxTextLength - 3))}...`
}

function harnessLabel(line: ChatLine): string | undefined {
  if (line.harness === undefined) {
    return undefined
  }

  return harnessById(normalizeHarness(line.harness)).shortLabel
}

function formatLine(villager: Villager, line: ChatLine): string | undefined {
  const harness = harnessLabel(line)
  const suffix = harness === undefined ? '' : ` via ${harness}`

  if (line.kind === 'message') {
    const speaker = line.from === 'you' ? 'Player' : `${escapeContext(villager.name)}${suffix}`

    return `${speaker}: ${clip(line.text)}`
  }

  if (line.kind === 'tool') {
    return `[Tool${suffix}] ${escapeContext(line.name)}: ${clip(line.summary)}`
  }

  if (line.kind === 'question') {
    const options = line.question.options.map((option) => option.label).filter((label) => label !== '').join(', ')
    const answered = line.question.answered?.join(', ')
    const details = [
      clip(line.question.question),
      options === '' ? '' : `Options: ${clip(options)}`,
      answered === undefined || answered === '' ? '' : `Answered: ${clip(answered)}`
    ]
      .filter((part) => part !== '')
      .join(' ')

    return `[Question${suffix}] ${details}`
  }

  if (line.kind === 'error') {
    return `[Error${suffix}] ${clip(line.message)}`
  }

  return undefined
}

/**
 * Build provider-neutral context for a fresh harness session. This is not a
 * replay of the previous provider conversation; it is continuity context.
 */
export function buildSessionHandoff(villager: Villager, transcript: ChatLine[]): SessionHandoff {
  const lines = transcript
    .map((line) => formatLine(villager, line))
    .filter((line): line is string => line !== undefined && line !== '')
    .slice(-maxLines)

  if (lines.length === 0) {
    return { transcript, prompt: '' }
  }

  return {
    transcript,
    prompt: [
      'You are taking over an existing villager conversation.',
      'Treat this saved transcript as context, not as a new player request.',
      'Preserve continuity with the player. Previous turns may have been handled by another harness.',
      'The current player message will arrive separately.',
      '',
      '<saved_transcript>',
      lines.join('\n'),
      '</saved_transcript>'
    ].join('\n')
  }
}
