/* eslint-disable max-classes-per-file */
export type ScanPhase = 'new' | 'running' | 'failed' | 'ready'

/** The rows that one scan read, and the reason of a scan that read none. */
export interface ScanOutcome<T> {
  readonly rows: T | undefined
  readonly failure: unknown
}

export const readScope = async <T>(read: () => Promise<T | undefined>): Promise<ScanOutcome<T>> => {
  try {
    return { rows: await read(), failure: undefined }
  } catch (failure) {
    return { rows: undefined, failure }
  }
}

/** Waits for the scan that `latest` gives, and again for each newer scan that started meanwhile. */
export const newest = async (latest: () => Promise<unknown>): Promise<void> => {
  const scan = latest()
  await scan
  if (latest() !== scan) await newest(latest)
}

interface Waiting {
  readonly timer: NodeJS.Timeout
  readonly work: () => Promise<void>
}

/** Runs each named work after a delay. A newer work of one name replaces the waiting one. */
export class DelayedWork {
  private readonly waiting = new Map<string, Waiting>()

  constructor(private readonly failed: (error: unknown) => void) {}

  later(name: string, work: () => Promise<void>, delay: number): void {
    clearTimeout(this.waiting.get(name)?.timer)
    this.waiting.set(name, { work, timer: setTimeout(() => this.start(name), delay) })
  }

  /** Runs now each waiting work whose name starts with `prefix`, and waits for them. */
  async now(prefix: string): Promise<void> {
    await Promise.all(
      [...this.waiting.keys()]
        .filter((name) => name.startsWith(prefix))
        .map((name) => this.start(name)),
    )
  }

  cancel(): void {
    this.waiting.forEach(({ timer }) => clearTimeout(timer))
    this.waiting.clear()
  }

  private async start(name: string): Promise<void> {
    const entry = this.waiting.get(name)
    if (entry === undefined) return
    clearTimeout(entry.timer)
    this.waiting.delete(name)
    await entry.work().catch(this.failed)
  }
}

/** A newer scan aborts the older one, and an aborted scan gives nothing. */
export class ScanRuns {
  private current: AbortController | undefined

  next(): AbortSignal {
    this.current?.abort()
    const controller = new AbortController()
    this.current = controller
    return controller.signal
  }

  cancel(): void {
    this.current?.abort()
  }

  // eslint-disable-next-line class-methods-use-this
  async run<T>(
    signal: AbortSignal,
    read: () => Promise<T | undefined>,
  ): Promise<ScanOutcome<T> | undefined> {
    const outcome = await readScope(read)
    return signal.aborted ? undefined : outcome
  }
}

/** Each scan takes a ticket, and only the newest ticket writes its result. */
export class ScanState {
  private value: ScanPhase = 'new'

  private ticket = 0

  get phase(): ScanPhase {
    return this.value
  }

  start(): number {
    this.value = 'running'
    this.ticket += 1
    return this.ticket
  }

  current(ticket: number): boolean {
    return ticket === this.ticket
  }

  finish(ticket: number, failed: boolean): boolean {
    if (!this.current(ticket)) return false
    this.value = failed ? 'failed' : 'ready'
    return true
  }
}

/** Settles once at the end of the first full scan, also when that scan fails. */
export class FirstScan {
  private readonly latch = Promise.withResolvers<void>()

  settle(): void {
    this.latch.resolve()
  }

  /** The value of `read` after the first full scan. */
  after<T>(read: () => T): Promise<T> {
    return this.latch.promise.then(read)
  }
}

/** A spinner over rows hides the rows, so a view with a row runs no spinner. */
export const isLoading = (phase: ScanPhase, rows: number): boolean =>
  rows === 0 && (phase === 'new' || phase === 'running')

export const LOADING_TEXT = 'The extension reads the review tasks.'
export const READ_LONG = 'The extension reads the review tasks of this view.'
export const FAILED_LONG = 'The extension did not read the review tasks. Use the Refresh button.'

export const emptyText = (phase: ScanPhase, finished: string): string => {
  if (phase === 'failed') return FAILED_LONG
  return phase === 'ready' ? finished : READ_LONG
}
