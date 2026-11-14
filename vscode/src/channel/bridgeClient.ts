import { type ClientRequest, request as httpRequest } from 'node:http'

import { type ReviewBatch, checkShape } from './schema'

export const TOKEN_HEADER = 'x-y-review-token'
export const SESSION_HEADER = 'X-Y-Review-Session'
export const EVENTS_PATH = '/events'
export const RESOLVE_PATH = '/resolve'
export const DEFAULT_RETRY_DELAY_MS = 1000
export const DEFAULT_RESOLVE_TIMEOUT_MS = 60_000
export const CONNECT_TIMEOUT_MS = 10_000
// The same limit stands in src/bridge/batchBuilder.ts and in BatchBuilder.kt. Keep the copies equal.
export const MAX_EVENT_CHARS = 4_000_000
const EVENT_END_TAIL = 3
const EVENT_END = /\r?\n\r?\n/

export interface Drained {
  readonly events: readonly string[]
  readonly rest: string
}

export interface Answer {
  readonly status: number
  readonly text: string
}

export interface ClientOptions {
  readonly bridgeUrl: string
  readonly token: string
  readonly sessionKey?: string
  readonly onError: (error: Error) => void
  readonly retryDelayMs?: number
  readonly resolveTimeoutMs?: number
  readonly onLost?: (reason: string) => Promise<void>
}

/** Whole SSE events and the incomplete rest. One space after `data:` is frame, not value. */
export const drainEvents = (buffer: string): Drained => {
  const blocks = buffer.replaceAll('\r\n', '\n').split('\n\n')
  return {
    events: blocks
      .slice(0, -1)
      .map((block) =>
        block
          .split('\n')
          .filter((part) => part.startsWith('data:'))
          .map((part) => part.slice(5).replace(/^ /, ''))
          .join('\n'),
      )
      .filter((event) => event !== ''),
    rest: blocks.at(-1) ?? '',
  }
}

const asError = (failure: unknown): Error =>
  failure instanceof Error ? failure : new Error(String(failure))
const isOk = (status: number): boolean => status >= 200 && status <= 299

export class BridgeClient {
  private running = false

  private readonly calls = new Set<ClientRequest>()

  private carry = ''

  private skipping = false

  private chain: Promise<void> = Promise.resolve()

  private onBatch: ((batch: ReviewBatch) => Promise<void>) | undefined

  constructor(private readonly options: ClientOptions) {}

  start(onBatch: (batch: ReviewBatch) => Promise<void>): void {
    if (this.running) return
    this.running = true
    this.onBatch = onBatch
    this.loop().catch((failure: unknown) => this.options.onError(asError(failure)))
  }

  /** Ends the stream and every open call, so no socket keeps the process alive. */
  stop(): void {
    this.running = false
    this.calls.forEach((call) => call.destroy())
    this.calls.clear()
  }

  /** A refusal keeps the comments open, so the model reads a reason and can report again. */
  async resolve(ids: readonly string[]): Promise<void> {
    const answer = await this.request('POST', RESOLVE_PATH, { ids })
    if (!isOk(answer.status))
      throw new Error(`the bridge refused the report with status ${answer.status}`)
  }

  /** One call with a deadline. The message of a failure names the address and never the token. */
  request(method: 'GET' | 'POST', path: string, body?: unknown): Promise<Answer> {
    const timeoutMs = this.options.resolveTimeoutMs ?? DEFAULT_RESOLVE_TIMEOUT_MS
    const text = body === undefined ? undefined : JSON.stringify(body)
    return new Promise((resolve, reject) => {
      const call = this.open(
        path,
        method,
        text === undefined ? {} : { 'content-type': 'application/json' },
      )
      const timer = setTimeout(() => {
        reject(this.silent(new Error(`no answer after ${timeoutMs} ms`)))
        call.destroy()
      }, timeoutMs)
      call.on('response', (response) => {
        const chunks: string[] = []
        response.setEncoding('utf8')
        response.on('data', (chunk: string) => chunks.push(chunk))
        response.on('error', (failure) => reject(this.silent(failure)))
        response.on('end', () => {
          clearTimeout(timer)
          resolve({ status: response.statusCode ?? 0, text: chunks.join('') })
        })
      })
      call.on('error', (failure) => {
        clearTimeout(timer)
        reject(this.silent(failure))
      })
      call.end(text)
    })
  }

  private open(path: string, method: 'GET' | 'POST', extra: Record<string, string>): ClientRequest {
    const call = httpRequest(`${this.options.bridgeUrl}${path}`, {
      method,
      headers: {
        ...extra,
        [TOKEN_HEADER]: this.options.token,
        ...(this.options.sessionKey === undefined
          ? {}
          : { [SESSION_HEADER]: this.options.sessionKey }),
      },
    })
    this.calls.add(call)
    call.on('close', () => this.calls.delete(call))
    return call
  }

  private silent(cause: Error): Error {
    return new Error(
      `the bridge did not answer at ${this.options.bridgeUrl} (${cause.message || cause.name})`,
    )
  }

  // --- The event stream ---

  private async loop(): Promise<void> {
    if (!this.running) return undefined
    await this.openStream().catch((failure: unknown) => {
      if (this.running) this.options.onError(asError(failure))
    })
    if (!this.running) return undefined
    // The wait alone keeps no process alive. Standard input does that while the session runs.
    await new Promise((resolve) => {
      setTimeout(resolve, this.options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS).unref()
    })
    return this.loop()
  }

  private openStream(): Promise<void> {
    return new Promise((resolve, reject) => {
      const call = this.open(EVENTS_PATH, 'GET', { accept: 'text/event-stream' })
      const timer = setTimeout(() => {
        reject(this.silent(new Error(`no connection after ${CONNECT_TIMEOUT_MS} ms`)))
        call.destroy()
      }, CONNECT_TIMEOUT_MS)
      call.on('response', (response) => {
        clearTimeout(timer)
        const status = response.statusCode ?? 0
        if (!isOk(status)) {
          response.resume()
          reject(new Error(`the bridge refused the event stream with status ${status}`))
          return
        }
        this.carry = ''
        this.skipping = false
        response.setEncoding('utf8')
        response.on('data', (chunk: string) => this.take(chunk))
        response.on('error', (failure) => {
          if (this.running) this.options.onError(failure)
        })
        response.on('close', () => {
          this.chain.then(
            () => resolve(),
            () => resolve(),
          )
        })
      })
      call.on('error', (failure) => {
        clearTimeout(timer)
        reject(this.silent(failure))
      })
      call.end()
    })
  }

  /** Drains only after a chunk with a line break. An event over the limit is skipped to its end. */
  private take(chunk: string): void {
    this.carry += chunk
    if (this.skipping) this.skipping = !this.dropToEventEnd()
    if (this.skipping) return
    if (chunk.includes('\n') || chunk.includes('\r')) {
      const drained = drainEvents(this.carry)
      this.carry = drained.rest
      drained.events.forEach((event) => {
        this.chain = this.chain.then(() =>
          event.length > MAX_EVENT_CHARS ? this.tooLarge() : this.handle(event),
        )
      })
    }
    if (this.carry.length > MAX_EVENT_CHARS) {
      this.carry = this.carry.slice(-EVENT_END_TAIL)
      this.skipping = !this.dropToEventEnd()
      this.chain = this.chain.then(() => this.tooLarge())
    }
  }

  private tooLarge(): Promise<void> {
    return this.lost(
      `the bridge sent an event of more than ${MAX_EVENT_CHARS} characters, so the channel dropped it`,
    )
  }

  private dropToEventEnd(): boolean {
    const end = EVENT_END.exec(this.carry)
    this.carry =
      end === null
        ? this.carry.slice(Math.max(0, this.carry.length - EVENT_END_TAIL))
        : this.carry.slice(end.index + end[0].length)
    return end !== null
  }

  /** A lost event reaches the log and the model, so the person learns that it did not arrive. */
  private async lost(reason: string): Promise<void> {
    this.options.onError(new Error(reason))
    await (this.options.onLost?.(reason) ?? Promise.resolve()).catch((failure: unknown) =>
      this.options.onError(asError(failure)),
    )
  }

  private async handle(data: string): Promise<void> {
    const parsed = (() => {
      try {
        return { value: JSON.parse(data) as unknown }
      } catch (failure) {
        return { problem: asError(failure).message || 'the value is not JSON' }
      }
    })()
    if ('problem' in parsed)
      return this.lost(`the bridge sent an event that is not JSON: ${parsed.problem}`)
    const batch = checkShape(parsed.value)
    if (batch.kind === 'bad')
      return this.lost(`the bridge sent a batch that does not match the contract: ${batch.reason}`)
    await (this.onBatch?.(batch.batch) ?? Promise.resolve()).catch((failure: unknown) =>
      this.options.onError(asError(failure)),
    )
    return undefined
  }
}
