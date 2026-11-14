export const MAX_QUEUED = 64
export const STOP = ''

/** The events of one stream. Beyond the bound, each new event is dropped and counted. */
export class StreamQueue {
  private readonly events: string[] = []

  private dropped = 0

  private waiter: ((event: string | undefined) => void) | undefined

  constructor(private readonly bound: number = MAX_QUEUED) {}

  add(event: string): void {
    const wake = this.waiter
    if (wake !== undefined) {
      this.waiter = undefined
      wake(event)
    } else if (this.events.length < this.bound) {
      this.events.push(event)
    } else {
      this.dropped += 1
    }
  }

  /** The first event, or undefined after `waitMs` with no event. One reader only. */
  next(waitMs: number): Promise<string | undefined> {
    const first = this.events.shift()
    if (first !== undefined) return Promise.resolve(first)
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.waiter = undefined
        resolve(undefined)
      }, waitMs)
      this.waiter = (event) => {
        clearTimeout(timer)
        resolve(event)
      }
    })
  }

  takeLoss(): number {
    const lost = this.dropped
    this.dropped = 0
    return lost
  }

  replaceWith(event: string): void {
    this.events.splice(0, this.events.length)
    this.add(event)
  }
}
