import { strict as assert } from 'node:assert'
import { createServer } from 'node:net'

import { pickPort } from '../../../src/session/freePort'

const bind = (port: number): Promise<boolean> =>
  new Promise((resolve) => {
    const server = createServer()
    server.once('error', () => resolve(false))
    server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)))
  })

describe('free port (FreePortTest.kt)', () => {
  it('a picked port is a real port number', async () => {
    const port = await pickPort()
    assert.ok(port !== undefined && port >= 1 && port <= 65535, `${port}`)
  })

  it('a picked port can be bound right after', async () => {
    const port = await pickPort()
    assert.ok(port !== undefined)
    assert.equal(await bind(port), true)
  })

  it('two picks in a row give two numbers', async () => {
    const [first, second] = [await pickPort(), await pickPort()]
    assert.ok(first !== undefined && first > 0 && second !== undefined && second > 0)
  })
})
