import type { Villager } from '../../shared/agents'
import type { AgentSession, SessionHandlers } from './session-types'

/** Canned, persona-flavoured replies used when a selected harness is unavailable. */
const mockReplies: Record<string, string[]> = {
  planner: [
    "Let's break that into steps before we touch anything.",
    'Good question - first, what outcome are we aiming for?',
    "I'd sketch the plan, then hand it to Builder."
  ],
  builder: [
    "On it - I'd wire that up straight away.",
    'Easy enough. Point me at the file and I can picture the change.',
    "Let's just build the simplest version first."
  ],
  reviewer: [
    'Hmm, have we thought about the edge cases there?',
    "It might work, but I'd want a second look before we ship it.",
    'Looks alright - though I have a couple of nits.'
  ],
  explorer: [
    "Ooh, interesting - what happens if we dig a little deeper?",
    "I haven't seen that corner of the camp yet. Let's find out!",
    "Curious. I'd poke at it and see what turns up."
  ]
}

/**
 * A mock session that streams a canned, persona-appropriate reply token by token.
 */
export function createMockSession(villager: Villager, handlers: SessionHandlers): AgentSession {
  const pool = mockReplies[villager.id] ?? [`Hello - I'm ${villager.name}.`, 'Tell me more.', "I'm thinking it over."]
  let turn = 0
  const timers = new Set<ReturnType<typeof setTimeout>>()
  let closed = false

  const wait = (ms: number): Promise<void> =>
    new Promise((resolve) => {
      const timer = setTimeout(() => {
        timers.delete(timer)
        resolve()
      }, ms)
      timers.add(timer)
    })

  return {
    send: (_text: string) => {
      const reply = pool[turn % pool.length] ?? '...'
      turn += 1

      void (async () => {
        handlers.onStatus('working')
        await wait(450)

        if (closed) {
          return
        }

        handlers.onStatus('talking')

        const words = reply.split(' ')

        for (let index = 0; index < words.length; index += 1) {
          if (closed) {
            return
          }

          const piece = (index === 0 ? '' : ' ') + words[index]
          handlers.onToken(piece)
          await wait(70)
        }

        handlers.onReply(reply)
        handlers.onStatus('idle')
      })()
    },
    answer: () => {
      // Mock sessions never ask structured questions.
    },
    close: () => {
      closed = true

      for (const timer of timers) {
        clearTimeout(timer)
      }

      timers.clear()
    }
  }
}
