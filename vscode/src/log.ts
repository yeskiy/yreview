import { redactText } from './core/redact'

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
}

/** Every log line goes through the redaction, so no path, address or secret reaches the log. */
export const redactingLog = (sink: LogSink, places: () => Places): Log => {
  const clean = (message: string): string => {
    const now = places()
    return redactText(message, now.homes, now.projects, now.repositories)
  }
  return {
    debug: (message) => sink.debug(clean(message)),
    info: (message) => sink.info(clean(message)),
    warn: (message) => sink.warn(clean(message)),
    error: (message, failure) =>
      sink.error(
        clean(
          failure instanceof Error ? `${message} ${failure.name}: ${failure.message}` : message,
        ),
      ),
  }
}
