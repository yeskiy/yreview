import { strict as assert } from 'node:assert'
import { inspect } from 'node:util'

import { agentOf } from '../../../src/session/catalog'
import { LocalServer, openLocalServer } from '../../../src/session/localServer'

const PORT = 47821
// A throwaway value. No session of a user ever runs with it.
const PASSWORD = '8c1d05b7e3a94f26'
const FILE = 'secret.txt'

describe('local server (LocalServerTest.kt)', () => {
  it('an agent with no server of its own opens no port', async () => {
    const picked: boolean[] = []
    const server = await openLocalServer(
      agentOf('claude').push,
      async () => FILE,
      async () => {
        picked.push(true)
        return PORT
      },
      () => PASSWORD,
    )
    assert.equal(server, undefined)
    assert.deepEqual(picked, [], 'an agent that runs no server must bind no port')
  })

  it('a machine that gives no port writes no password', async () => {
    const written: string[] = []
    const server = await openLocalServer(
      agentOf('opencode').push,
      async (password) => {
        written.push(password)
        return FILE
      },
      async () => undefined,
      () => PASSWORD,
    )
    assert.equal(server, undefined)
    assert.deepEqual(written, [], 'a start with no port must leave no secret on the disk')
  })

  it('a failed write of the password file leaves no port', async () =>
    assert.equal(
      await openLocalServer(
        agentOf('opencode').push,
        async () => undefined,
        async () => PORT,
        () => PASSWORD,
      ),
      undefined,
    ))

  it('a start that writes the file carries the port and the password', async () => {
    const server = await openLocalServer(
      agentOf('opencode').push,
      async () => FILE,
      async () => PORT,
      () => PASSWORD,
    )
    assert.equal(server?.port, PORT)
    assert.equal(server?.password, PASSWORD)
    assert.equal(server?.passwordFile, FILE)
  })

  it('the file carries the password that the server holds', async () => {
    const server = await openLocalServer(
      agentOf('opencode').push,
      async (password) => (password === PASSWORD ? FILE : undefined),
      async () => PORT,
      () => PASSWORD,
    )
    assert.equal(server?.password, PASSWORD)
  })

  it('the password never reaches a log', () => {
    const server = new LocalServer(PORT, PASSWORD, FILE)
    assert.equal(String(server), `LocalServer(port=${PORT})`)
    ;[String(server), JSON.stringify(server), inspect(server), `${server}`].forEach((text) => {
      assert.ok(text.includes(String(PORT)), text)
      assert.ok(!text.includes(PASSWORD), text)
    })
  })
})
