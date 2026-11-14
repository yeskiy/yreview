import { type AddressInfo, createServer } from 'node:net'

/** A free loopback port. Another process can take it before the agent binds, and portRetry covers that. */
export const pickPort = (): Promise<number | undefined> =>
  new Promise((resolve) => {
    const server = createServer()
    server.once('error', () => resolve(undefined))
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo
      server.close(() => resolve(port))
    })
  })
