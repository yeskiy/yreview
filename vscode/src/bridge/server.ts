import { once } from 'node:events'
import { type IncomingMessage, type Server, type ServerResponse, createServer } from 'node:http'
import type { AddressInfo } from 'node:net'

import { SESSION_HEADER, isValidSessionKey } from '../session/sessionKey'
import { MAX_SESSIONS } from '../session/sessionRules'
import { countOf } from '../tasks/taskLabels'
import { type ReviewBatch, encodeBatch } from './batch'
import { parseResolve } from './resolveRequest'
import { STOP, StreamQueue } from './streamQueue'
import { TOKEN_HEADER, newToken, tokenMatches } from './token'

export interface BridgeAddress {
  readonly url: string
  readonly token: string
  readonly port: number
}

export type ResolveHandler = (
  ids: readonly string[],
  session: string | undefined,
) => Promise<string | undefined>

export interface RouteRequest {
  readonly query: URLSearchParams
  readonly body: string
  readonly session: string | undefined
}

export interface RouteAnswer {
  readonly status: number
  readonly body: unknown
}

export type RouteHandler = (request: RouteRequest) => Promise<RouteAnswer>
export type Route = Readonly<Partial<Record<'GET' | 'POST', RouteHandler>>>

export const EVENTS_PATH = '/events'
export const RESOLVE_PATH = '/resolve'
export const MAX_BODY_BYTES = 1_000_000
export const MAX_STREAMS = MAX_SESSIONS
export const KEEPALIVE_MS = 20_000
const LOOPBACK = '127.0.0.1'
const BUILT_IN: ReadonlyMap<string, 'GET' | 'POST'> = new Map([
  [EVENTS_PATH, 'GET'],
  [RESOLVE_PATH, 'POST'],
])

/** An SSE comment line, so it never looks like a batch. */
export const lossLine = (lost: number): string =>
  `: the bridge dropped ${countOf(lost, 'event')} for this session, because it read none\n\n`

interface Reader {
  readonly key: string | undefined
  readonly queue: StreamQueue
}

const header = (request: IncomingMessage, name: string): string | undefined => {
  const value = request.headers[name.toLowerCase()]
  return Array.isArray(value) ? value[0] : value
}

const sessionOf = (request: IncomingMessage): string | undefined => {
  const value = header(request, SESSION_HEADER)
  return isValidSessionKey(value) ? value : undefined
}

const answer = (response: ServerResponse, status: number, text: string): void => {
  response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' }).end(text)
}

/** The body, `'tooLarge'` past the cap, or `'unreadable'` after a broken read. */
const readBody = (request: IncomingMessage): Promise<string | 'tooLarge' | 'unreadable'> =>
  new Promise((resolve) => {
    const chunks: Buffer[] = []
    const seen = { bytes: 0 }
    request.on('data', (chunk: Buffer) => {
      seen.bytes += chunk.length
      if (seen.bytes > MAX_BODY_BYTES) resolve('tooLarge')
      else chunks.push(chunk)
    })
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    request.on('error', () => resolve('unreadable'))
  })

/** The loopback HTTP bridge. It holds no editor object, so a test starts it on a free port. */
export class BridgeServer {
  private readonly streams = new Set<Reader>()

  private http: Server | undefined

  private token = ''

  private port = 0

  constructor(
    private readonly onResolve: ResolveHandler,
    private readonly routes: ReadonlyMap<string, Route> = new Map(),
    private readonly keepAliveMs: number = KEEPALIVE_MS,
  ) {}

  async start(): Promise<BridgeAddress> {
    if (this.http !== undefined) throw new Error('The bridge server already runs.')
    const server = createServer((request, response) => {
      this.handle(request, response).catch(() => {
        if (response.headersSent) response.destroy()
        else answer(response, 500, 'The bridge failed.')
      })
    })
    this.http = server
    this.token = newToken()
    server.listen(0, LOOPBACK)
    await once(server, 'listening')
    this.port = (server.address() as AddressInfo).port
    return { url: `http://${LOOPBACK}:${this.port}`, token: this.token, port: this.port }
  }

  async stop(): Promise<void> {
    const server = this.http
    this.http = undefined
    this.token = ''
    this.streams.forEach((reader) => reader.queue.replaceWith(STOP))
    this.streams.clear()
    if (server === undefined) return
    server.closeAllConnections()
    await new Promise<void>((resolve) => {
      server.close(() => resolve())
    })
  }

  /** The number of streams the batch reached. A target that left gives 0. */
  send(batch: ReviewBatch, target?: string): number {
    const data = encodeBatch(batch)
    const open = [...this.streams].filter((reader) => target === undefined || reader.key === target)
    open.forEach((reader) => reader.queue.add(data))
    return open.length
  }

  streamCount(): number {
    return this.streams.size
  }

  openKeys(): readonly string[] {
    return [
      ...new Set(
        [...this.streams].flatMap((reader) => (reader.key === undefined ? [] : [reader.key])),
      ),
    ]
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? '/', `http://${LOOPBACK}`)
    const route = this.routes.get(url.pathname)
    const builtIn = BUILT_IN.get(url.pathname)
    const methods = builtIn === undefined ? Object.keys(route ?? {}) : [builtIn]
    if (methods.length === 0) return answer(response, 404, 'This path is not part of the bridge.')
    if (!tokenMatches(this.token, header(request, TOKEN_HEADER))) {
      return answer(response, 401, 'The token does not match.')
    }
    const host = header(request, 'host')
    if (host !== `${LOOPBACK}:${this.port}` && host !== `localhost:${this.port}`) {
      return answer(response, 403, 'The Host header must name the loopback address of the bridge.')
    }
    const wrongMethod = `This path answers ${methods.join(' and ')} only.`
    if (!methods.includes(request.method ?? '')) return answer(response, 405, wrongMethod)
    if (url.pathname === EVENTS_PATH) return this.stream(request, response)
    const body = await readBody(request)
    if (body === 'tooLarge') return answer(response, 413, 'The body is too large.')
    if (body === 'unreadable')
      return answer(response, 400, 'The extension could not read the body.')
    if (url.pathname === RESOLVE_PATH) return this.resolve(body, sessionOf(request), response)
    const handler = route?.[request.method as 'GET' | 'POST']
    if (handler === undefined) return answer(response, 405, wrongMethod)
    const routed = await handler({ query: url.searchParams, body, session: sessionOf(request) })
    response
      .writeHead(routed.status, { 'Content-Type': 'application/json; charset=utf-8' })
      .end(JSON.stringify(routed.body))
    return undefined
  }

  /** A refusal keeps the comments open on the channel side, so the model reads the reason. */
  private async resolve(
    body: string,
    session: string | undefined,
    response: ServerResponse,
  ): Promise<void> {
    const parsed = parseResolve(body)
    if (parsed.kind === 'bad') return answer(response, 400, parsed.reason)
    const outcome = await this.onResolve(parsed.ids, session).then(
      (problem) => ({ problem, failed: undefined }),
      (failure: unknown) => ({
        problem: undefined,
        failed:
          failure instanceof Error && failure.message !== ''
            ? failure.message
            : 'The extension could not write the resolution.',
      }),
    )
    if (outcome.failed !== undefined) return answer(response, 500, outcome.failed)
    return outcome.problem === undefined
      ? answer(response, 200, 'ok')
      : answer(response, 409, outcome.problem)
  }

  /** One SSE connection. The pump waits on the queue and on `drain`, so a stalled client fills its queue. */
  private async stream(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (this.streams.size >= MAX_STREAMS) {
      return answer(response, 503, 'Too many sessions read this bridge.')
    }
    const reader: Reader = { key: sessionOf(request), queue: new StreamQueue() }
    this.streams.add(reader)
    const closed = new Promise<void>((resolve) => {
      response.once('close', () => {
        reader.queue.replaceWith(STOP)
        resolve()
      })
    })
    const write = async (text: string): Promise<void> => {
      if (!response.write(text)) {
        await Promise.race([
          new Promise((resolve) => {
            response.once('drain', resolve)
          }),
          closed,
        ])
      }
    }
    const pump = async (): Promise<void> => {
      const next = await reader.queue.next(this.keepAliveMs)
      const lost = reader.queue.takeLoss()
      if (lost > 0) await write(lossLine(lost))
      if (next === STOP || response.destroyed) return undefined
      await write(next === undefined ? ': keep-alive\n\n' : `data: ${next}\n\n`)
      return pump()
    }
    response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' })
    try {
      await write(': open\n\n')
      await pump()
    } finally {
      this.streams.delete(reader)
      response.end()
    }
    return undefined
  }
}
