import type { SessionHandlers } from './session-types'

/** Stream a plain-text reply through token handlers with a small typewriter delay. */
export async function streamReply(text: string, handlers: SessionHandlers, isClosed: () => boolean): Promise<void> {
  handlers.onStatus('talking')

  const pieces = text.match(/\S+\s*/g) ?? [text]

  for (const piece of pieces) {
    if (isClosed()) {
      return
    }

    handlers.onToken(piece)
    await new Promise((resolve) => setTimeout(resolve, 35))
  }
}
