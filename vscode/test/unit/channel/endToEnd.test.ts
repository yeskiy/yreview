import { strict as assert } from 'node:assert'

import { PassThrough } from 'node:stream'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import type { Notification } from '@modelcontextprotocol/sdk/types.js'

import { ChannelApp } from '../../../src/channel/app'
import { LOST_TEXT, TOOL_NAME } from '../../../src/channel/reviewChannel'
import type { ReviewBatch } from '../../../src/channel/schema'
import { FakeBridge, waitFor } from './fakeBridge'

const fullId = 'c3f9a12aabbccddeeff00112233445566778899a'
const batch: ReviewBatch = {
  batchId: 'b7f2a91',
  branch: 'feat/channel-server',
  commit: '4f2c8b1c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6',
  comments: [
    {
      id: fullId,
      path: 'src/main/kotlin/Parser.kt',
      startLine: 88,
      endLine: 94,
      revision: 'HEAD',
      text: 'This branch never runs when the input is empty. Add the guard before the loop.',
    },
  ],
}

interface Params {
  readonly content?: string
  readonly meta?: Record<string, string>
}

describe('channel end to end (EndToEndTest.kt)', () => {
  const state: {
    bridge: FakeBridge
    app?: ChannelApp
    errors: Error[]
    notifications: Notification[]
  } = {
    bridge: new FakeBridge(),
    errors: [],
    notifications: [],
  }

  beforeEach(async () => {
    state.bridge = new FakeBridge()
    state.app = undefined
    state.errors = []
    state.notifications = []
    await state.bridge.start()
  })

  afterEach(async () => {
    await state.app?.stop()
    await state.bridge.close()
  })

  const setUp = async (): Promise<Client> => {
    const app = new ChannelApp(
      { bridgeUrl: state.bridge.url, token: state.bridge.token },
      (error) => state.errors.push(error),
      20,
    )
    state.app = app
    const client = new Client({ name: 'test-client', version: '0.0.0' })
    client.fallbackNotificationHandler = async (notification) => {
      state.notifications.push(notification)
    }
    const [server, other] = InMemoryTransport.createLinkedPair()
    await app.connect(server)
    await client.connect(other)
    await state.bridge.waitForStream()
    return client
  }

  const paramsOf = (at: number): Params => (state.notifications[at]?.params ?? {}) as Params

  it('turns a batch from the bridge into one channel notification', async () => {
    await setUp()
    state.bridge.push(batch)
    await waitFor('the notification', () => state.notifications.length > 0)
    assert.equal(state.notifications[0]?.method, 'notifications/claude/channel')
    assert.equal(
      paramsOf(0).content,
      `[${fullId}] src/main/kotlin/Parser.kt:88-94 @HEAD\n` +
        '> This branch never runs when the input is empty. Add the guard before the loop.',
    )
    const meta = paramsOf(0).meta ?? {}
    assert.deepEqual(Object.keys(meta).sort(), ['batch_id', 'branch', 'commit', 'count'])
    assert.equal(meta.branch, 'feat/channel-server')
    assert.equal(meta.count, '1')
    assert.equal(meta.batch_id, 'b7f2a91')
  })

  it('sends the full id back to the bridge when the model resolves the short id', async () => {
    const client = await setUp()
    state.bridge.push(batch)
    await waitFor('the notification', () => state.notifications.length > 0)
    const result = await client.callTool({ name: TOOL_NAME, arguments: { ids: ['c3f9a12'] } })
    assert.equal(result.isError, undefined)
    assert.deepEqual(state.bridge.resolved, [[fullId]])
  })

  it('reports a batch that does not match the contract without stopping the stream', async () => {
    await setUp()
    state.bridge.pushRaw('{"batchId":"b1"}')
    await waitFor('the error', () => state.errors.length > 0)
    state.bridge.push(batch)
    await waitFor('the good notification', () => state.notifications.length === 2)
    assert.equal(paramsOf(0).meta?.notice, 'lost')
    assert.ok((paramsOf(0).content ?? '').startsWith(LOST_TEXT))
    assert.equal(paramsOf(1).meta?.count, '1')
  })

  it('stops once when the close of the transport calls stop again', async () => {
    const app = new ChannelApp(
      { bridgeUrl: state.bridge.url, token: state.bridge.token },
      (error) => state.errors.push(error),
      20,
    )
    // The stdio transport calls onclose inside its close, as in main.ts.
    const transport = new StdioServerTransport(new PassThrough(), new PassThrough())
    const stops: Promise<void>[] = []
    transport.onclose = () => {
      stops.push(app.stop())
    }
    await app.connect(transport)
    await app.stop()
    await Promise.all(stops)
    assert.equal(stops.length, 1)
    assert.deepEqual(state.errors, [])
  })
})
