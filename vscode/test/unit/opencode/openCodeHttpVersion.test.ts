import { strict as assert } from 'node:assert'

import { APPEND_PATH, SUBMIT_PATH, pushPrompt } from '../../../src/bridge/openCodeClient'
import { type FakeOpenCode, startOpenCode } from './fakeOpenCode'

describe('OpenCode HTTP version (OpenCodeHttpVersionTest.kt)', () => {
  const held: { fake: FakeOpenCode | undefined } = { fake: undefined }
  const start = async (): Promise<FakeOpenCode> => {
    held.fake = await startOpenCode()
    return held.fake
  }
  afterEach(async () => {
    await held.fake?.stop()
    held.fake = undefined
  })

  it('the client speaks http version 1 1', async () => {
    const server = await start()
    await pushPrompt(server.port, 's3cret', 'do the work')
    assert.deepEqual(server.versions, ['1.1', '1.1'])
  })

  it('a push goes through against a server that speaks version 1 1 alone', async () => {
    const server = await start()
    assert.equal(await pushPrompt(server.port, 's3cret', 'do the work'), undefined)
    assert.deepEqual(server.paths, [APPEND_PATH, SUBMIT_PATH])
  })

  it('a push never asks the server to change the version', async () => {
    const server = await start()
    await pushPrompt(server.port, 's3cret', 'do the work')
    assert.deepEqual(server.upgrades, [])
  })
})
