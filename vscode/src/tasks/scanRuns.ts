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
