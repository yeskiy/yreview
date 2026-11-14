import { redactText } from './core/redact'
import type { SessionLog } from './diagnostic/sessionLog'
import { type SessionRecord, failureRecord, recordText } from './diagnostic/sessionRecord'

export interface LogSink {
  debug(message: string): void
  info(message: string): void
  warn(message: string): void
  error(message: string): void
}

export interface Places {
  readonly homes: readonly string[]
  readonly projects: readonly string[]
  readonly repositories: readonly string[]
}

export interface Log {
  debug(message: string): void
  info(message: string): void
  warn(message: string): void
  error(message: string, failure?: unknown): void
  /** Keeps one record in the ring of the window, and writes its clean text to the log. */
  record(entry: SessionRecord): void
}

export interface LogOptions {
  /** The ring that keeps the last records of the window. */
  readonly ring?: SessionLog
  /** The folder of the extension. A failure record names the first frame under it. */
  readonly ownRoot?: string
}

/** Every log line goes through the redaction, so no path, address or secret reaches the log. */
export const redactingLog = (
  sink: LogSink,
  places: () => Places,
  options: LogOptions = {},
): Log => {
  const clean = (message: string): string => {
    const now = places()
    return redactText(message, now.homes, now.projects, now.repositories)
  }
  /** The ring keeps clean facts, so a folder that leaves the window later stays hidden. */
  const keep = (entry: SessionRecord): void =>
    options.ring?.add({
      ...entry,
      facts: entry.facts.map(([name, value]) => [name, clean(value)] as const),
    })
  return {
    debug: (message) => sink.debug(clean(message)),
    info: (message) => sink.info(clean(message)),
    warn: (message) => sink.warn(clean(message)),
    error: (message, failure) => {
      sink.error(
        clean(
          failure instanceof Error ? `${message} ${failure.name}: ${failure.message}` : message,
        ),
      )
      if (failure !== undefined) {
        keep(failureRecord(message, failure, options.ownRoot ?? ''))
      }
    },
    record: (entry) => {
      keep(entry)
      sink.info(clean(`Yreview made a record.\n${recordText(entry)}`))
    },
  }
}
