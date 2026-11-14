import { type IncomingMessage, type ServerResponse, createServer } from 'node:http'
import type { AddressInfo } from 'node:net'

const DEADLINE_MS = 10_000

/** Polls until the condition holds, or fails with the name of what it waited for. */
export const waitFor = async (what: string, ready: () => boolean): Promise<void> => {
  const deadline = Date.now() + DEADLINE_MS
  const poll = async (): Promise<void> => {
    if (ready()) return undefined
    if (Date.now() > deadline) throw new Error(`gave up waiting for ${what}`)
    await new Promise((resolve) => {
      setTimeout(resolve, 10)
    })
    return poll()
  }
  return poll()
}

/** The port of FakeBridge.kt: it records each token, session key and resolve body. */
export class FakeBridge {
  readonly token: string

  readonly resolved: string[][] = []

  readonly streamTokens: string[] = []

  readonly resolveTokens: string[] = []

  readonly streamKeys: string[] = []

  readonly resolveKeys: string[] = []

  stallResolve = false

  refusal: string | undefined = undefined

  private readonly open = new Set<ServerResponse>()

  private readonly http = createServer((request, response) => this.route(request, response))

  url = ''

  constructor(token = 'a-token-of-32-characters-000000000') {
    this.token = token
  }

  async start(): Promise<void> {
    await new Promise<void>((resolve) => {
      this.http.listen(0, '127.0.0.1', resolve)
    })
    this.url = `http://127.0.0.1:${(this.http.address() as AddressInfo).port}`
  }

  streamCount(): number {
    return this.open.size
  }

  async waitForStream(): Promise<void> {
    await waitFor('the event stream', () => this.open.size > 0)
  }

  push(batch: unknown): void {
    this.pushRaw(JSON.stringify(batch))
  }

  /** A line break inside the value opens a new data line, as an SSE writer does. */
  pushRaw(data: string): void {
    this.open.forEach((response) =>
      response.write(`data: ${data.replaceAll('\n', '\ndata: ')}\n\n`),
    )
  }

  dropStreams(): void {
    this.open.forEach((response) => response.destroy())
    this.open.clear()
  }

  async close(): Promise<void> {
    this.dropStreams()
    this.http.closeAllConnections()
    await new Promise<void>((resolve) => {
      this.http.close(() => resolve())
    })
  }

  private route(request: IncomingMessage, response: ServerResponse): void {
    const token = String(request.headers['x-y-review-token'] ?? '')
    const key = String(request.headers['x-y-review-session'] ?? '')
    if (request.url === '/events') this.events(token, key, response)
    else if (request.url === '/resolve') this.resolve(token, key, request, response)
    else response.writeHead(404).end('unknown path')
  }

  private events(token: string, key: string, response: ServerResponse): void {
    this.streamTokens.push(token)
    this.streamKeys.push(key)
    if (token !== this.token) {
      response.writeHead(401).end('the token does not match')
      return
    }
    response.writeHead(200, { 'Content-Type': 'text/event-stream' })
    response.write(': open\n\n')
    this.open.add(response)
    response.on('close', () => this.open.delete(response))
  }

  private resolve(
    token: string,
    key: string,
    request: IncomingMessage,
    response: ServerResponse,
  ): void {
    this.resolveTokens.push(token)
    this.resolveKeys.push(key)
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => {
      if (token !== this.token) {
        response.writeHead(401).end('the token does not match')
        return
      }
      this.resolved.push(
        (JSON.parse(Buffer.concat(chunks).toString('utf8')) as { ids: string[] }).ids,
      )
      if (this.refusal !== undefined) response.writeHead(409).end(this.refusal)
      else if (!this.stallResolve) response.writeHead(200).end('ok')
    })
  }
}
