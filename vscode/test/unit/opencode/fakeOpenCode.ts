import { type Server, createServer } from 'node:http'
import type { AddressInfo } from 'node:net'

export interface FakeOpenCode {
  readonly port: number
  readonly paths: string[]
  readonly bodies: string[]
  readonly authorizations: string[]
  readonly versions: string[]
  readonly upgrades: string[]
  readonly stop: () => Promise<void>
}

const close = (server: Server): Promise<void> =>
  new Promise((resolve) => {
    server.closeAllConnections()
    server.close(() => resolve())
  })

/** The HTTP server of one OpenCode session, small enough for a test. */
export const startOpenCode = (status = 200, sessions = '[]'): Promise<FakeOpenCode> => {
  const record = {
    paths: [] as string[],
    bodies: [] as string[],
    authorizations: [] as string[],
    versions: [] as string[],
    upgrades: [] as string[],
  }
  const server = createServer((request, response) => {
    const url = request.url ?? ''
    record.paths.push(url)
    record.versions.push(request.httpVersion)
    record.authorizations.push(request.headers.authorization ?? '')
    if (request.headers.upgrade !== undefined || request.headers['http2-settings'] !== undefined) {
      record.upgrades.push(url)
    }
    const parts: Buffer[] = []
    request.on('data', (part: Buffer) => parts.push(part))
    request.on('end', () => {
      record.bodies.push(Buffer.concat(parts).toString('utf8'))
      response.writeHead(status, { 'Content-Type': 'application/json', Connection: 'close' })
      response.end(url.startsWith('/session') ? sessions : 'true')
    })
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () =>
      resolve({
        ...record,
        port: (server.address() as AddressInfo).port,
        stop: () => close(server),
      }),
    )
  })
}

/** The port of a server that stopped, so nothing listens on it any more. */
export const deadPort = async (): Promise<number> => {
  const server = await startOpenCode()
  await server.stop()
  return server.port
}
