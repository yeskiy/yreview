import { strict as assert } from 'node:assert'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { ListResourcesResultSchema, type Notification } from '@modelcontextprotocol/sdk/types.js'

import {
  CHANNEL_CAPABILITY,
  CHANNEL_METHOD,
  INSTRUCTIONS,
  MAX_OPEN_BATCHES,
  ReviewChannel,
  SERVER_NAME,
  TOOL_NAME,
} from '../../../src/channel/reviewChannel'
import type { ReviewBatch, ReviewComment } from '../../../src/channel/schema'
import { waitFor } from './fakeBridge'

const parserId = 'c3f9a12aabbccddeeff00112233445566778899a'
const lexerId = 'a7710de0011223344556677889900aabbccddeef'
const batch: ReviewBatch = {
  batchId: 'b7f2a91',
  branch: 'feat/channel-server',
  commit: '4f2c8b1c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6',
  comments: [
    {
      id: parserId,
      path: 'src/main/kotlin/Parser.kt',
      startLine: 88,
      endLine: 94,
      revision: 'HEAD',
      text: 'This branch never runs when the input is empty. Add the guard before the loop.',
    },
    {
      id: lexerId,
      path: 'src/main/kotlin/Lexer.kt',
      startLine: 12,
      endLine: 12,
      revision: '1111111000000000000000000000000000000000',
      side: 'left',
      text: 'This was already wrong before the change. Fix it in the same pass.',
    },
  ],
}

const comment = (id: string, path: string, line: number, text: string): ReviewComment => ({
  id,
  path,
  startLine: line,
  endLine: line,
  revision: 'HEAD',
  text,
})

interface CallResult {
  readonly isError?: boolean
  readonly content: readonly { readonly type: string; readonly text?: string }[]
}

const textOf = (result: CallResult): string =>
  result.content
    .flatMap((part) => (part.type === 'text' && part.text !== undefined ? [part.text] : []))
    .join('\n')

describe('review channel (ReviewChannelTest.kt)', () => {
  const state: {
    channel?: ReviewChannel
    reported: (readonly string[])[]
    failures: string[]
    notifications: Notification[]
  } = { reported: [], failures: [], notifications: [] }

  beforeEach(() => {
    state.channel = undefined
    state.reported = []
    state.failures = []
    state.notifications = []
  })

  afterEach(async () => {
    await state.channel?.close()
  })

  const setUp = async (): Promise<{ channel: ReviewChannel; client: Client }> => {
    const channel = new ReviewChannel(async (ids) => {
      if (state.failures[0] !== undefined) throw new Error(state.failures[0])
      state.reported.push([...ids])
    })
    state.channel = channel
    const client = new Client({ name: 'test-client', version: '0.0.0' })
    client.fallbackNotificationHandler = async (notification) => {
      state.notifications.push(notification)
    }
    const [server, other] = InMemoryTransport.createLinkedPair()
    await channel.connect(server)
    await client.connect(other)
    return { channel, client }
  }

  const push = async (channel: ReviewChannel, pushed: ReviewBatch): Promise<void> => {
    const before = state.notifications.length
    await channel.push(pushed)
    if (pushed.comments.length > 0)
      await waitFor('the notification', () => state.notifications.length > before)
  }

  const resolve = async (client: Client, ids: readonly unknown[]): Promise<CallResult> =>
    (await client.callTool({ name: TOOL_NAME, arguments: { ids } })) as CallResult

  const paramsOf = (at: number): Record<string, unknown> => state.notifications[at]?.params ?? {}

  it('declares the claude channel capability', async () => {
    const { client } = await setUp()
    assert.deepEqual(client.getServerCapabilities()?.experimental?.[CHANNEL_CAPABILITY], {})
  })

  it('declares the tools capability so the reply tool is discovered', async () => {
    const { client } = await setUp()
    assert.notEqual(client.getServerCapabilities()?.tools, undefined)
  })

  it('sends instructions that name the review_resolve tool', async () => {
    const { client } = await setUp()
    assert.ok((client.getInstructions() ?? '').includes(TOOL_NAME))
  })

  it('is named y-review so the source attribute reads y-review', async () => {
    const { client } = await setUp()
    assert.equal(SERVER_NAME, 'y-review')
    assert.equal(client.getServerVersion()?.name, SERVER_NAME)
  })

  it('offers the review_resolve tool with an ids array', async () => {
    const { client } = await setUp()
    const tool = (await client.listTools()).tools.find((candidate) => candidate.name === TOOL_NAME)
    assert.notEqual(tool?.inputSchema.properties?.ids, undefined)
    assert.deepEqual(tool?.inputSchema.required, ['ids'])
  })

  it('emits one notification for one batch', async () => {
    const { channel } = await setUp()
    await push(channel, batch)
    assert.equal(state.notifications.length, 1)
  })

  it('emits the notification under the channel method', async () => {
    const { channel } = await setUp()
    await push(channel, batch)
    assert.equal(state.notifications[0]?.method, CHANNEL_METHOD)
    assert.equal(CHANNEL_METHOD, 'notifications/claude/channel')
  })

  it('puts the formatted comments in the content field', async () => {
    const { channel } = await setUp()
    await push(channel, batch)
    assert.equal(
      paramsOf(0).content,
      `[${parserId}] src/main/kotlin/Parser.kt:88-94 @HEAD\n` +
        '> This branch never runs when the input is empty. Add the guard before the loop.\n' +
        '\n' +
        `[${lexerId}] src/main/kotlin/Lexer.kt:12-12 @1111111 (left side of the diff)\n` +
        '> This was already wrong before the change. Fix it in the same pass.',
    )
  })

  it('puts the branch, the commit, the count, and the batch id in the meta field', async () => {
    const { channel } = await setUp()
    await push(channel, batch)
    assert.deepEqual(paramsOf(0).meta, {
      branch: 'feat/channel-server',
      commit: '4f2c8b1c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6',
      count: '2',
      batch_id: 'b7f2a91',
    })
  })

  it('does not emit a notification for a batch with no comments', async () => {
    const { channel } = await setUp()
    await push(channel, { ...batch, comments: [] })
    assert.equal(state.notifications.length, 0)
  })

  it('reports the full id to the bridge when the model gives the short id', async () => {
    const { channel, client } = await setUp()
    await push(channel, batch)
    await resolve(client, ['c3f9a12'])
    assert.deepEqual(state.reported, [[parserId]])
  })

  it('reports the full id to the bridge when the model gives the full id', async () => {
    const { channel, client } = await setUp()
    await push(channel, batch)
    await resolve(client, [lexerId])
    assert.deepEqual(state.reported, [[lexerId]])
  })

  it('reports several ids in one call to the bridge', async () => {
    const { channel, client } = await setUp()
    await push(channel, batch)
    await resolve(client, ['c3f9a12', 'a7710de'])
    assert.deepEqual(state.reported, [[parserId, lexerId]])
  })

  it('passes an id that matches no open comment on unchanged', async () => {
    const { channel, client } = await setUp()
    await push(channel, batch)
    await resolve(client, ['c3f9a12', 'ffffff0'])
    assert.deepEqual(state.reported, [[parserId, 'ffffff0']])
  })

  it('does not report an id that several open comments match', async () => {
    const { channel, client } = await setUp()
    await push(channel, {
      ...batch,
      comments: [
        comment('dd11111111111111111111111111111111111111', 'a.kt', 1, 'one'),
        comment('dd22222222222222222222222222222222222222', 'b.kt', 2, 'two'),
      ],
    })
    assert.equal((await resolve(client, ['dd'])).isError, true)
    assert.deepEqual(state.reported, [])
  })

  it('forgets a comment after the bridge accepted it', async () => {
    const { channel, client } = await setUp()
    await push(channel, batch)
    await resolve(client, ['c3f9a12'])
    await resolve(client, ['c3f9a12'])
    assert.deepEqual(state.reported, [[parserId], ['c3f9a12']])
  })

  it('keeps the comment open when the bridge call fails', async () => {
    const { channel, client } = await setUp()
    await push(channel, batch)
    state.failures.push('the bridge is gone')
    const failed = await resolve(client, ['c3f9a12'])
    assert.equal(failed.isError, true)
    assert.match(textOf(failed), /the bridge is gone/)
    state.failures.length = 0
    await resolve(client, ['c3f9a12'])
    assert.deepEqual(state.reported, [[parserId]])
  })

  it('rejects a call that carries no ids', async () => {
    const { client } = await setUp()
    assert.equal((await resolve(client, [])).isError, true)
  })

  it('drops the oldest batch when too many batches stay open', async () => {
    const { channel, client } = await setUp()
    const count = MAX_OPEN_BATCHES + 8
    const idOf = (index: number): string =>
      `${String(index).padStart(4, '0')}aaaabbbbccccddddeeeeffff00001111`
    await Array.from({ length: count }, (_, index) => index).reduce(
      (previous, index) =>
        previous.then(() =>
          push(channel, {
            ...batch,
            batchId: `batch${index}`,
            comments: [comment(idOf(index), 'a.kt', 1, 'one')],
          }),
        ),
      Promise.resolve(),
    )
    await resolve(client, ['0000aaa'])
    await resolve(client, [`${String(count - 1).padStart(4, '0')}aaa`])
    assert.deepEqual(state.reported, [['0000aaa'], [idOf(count - 1)]])
    assert.equal(state.notifications.length, count, 'every batch must reach the model')
  })

  it('reports an id to the bridge when no batch was ever pushed', async () => {
    // An agent that takes no push reads the id from tasks.json, so the server must pass it on.
    const { client } = await setUp()
    await resolve(client, [parserId])
    assert.deepEqual(state.reported, [[parserId]])
  })

  it('passes an id on without a batch even when the id is short', async () => {
    const { client } = await setUp()
    await resolve(client, ['c3f9a12'])
    assert.deepEqual(state.reported, [['c3f9a12']])
  })

  it('passes an id from tasks.json on while a batch is open', async () => {
    // A session that got a push can also get ids from tasks.json or the clipboard prompt.
    const { channel, client } = await setUp()
    await push(channel, batch)
    assert.equal((await resolve(client, ['yb1234'])).isError, undefined)
    assert.deepEqual(state.reported, [['yb1234']])
  })

  it('the instructions name the file that holds the ids without a push', () => {
    assert.ok(INSTRUCTIONS.includes('tasks.json'))
  })

  it('a push during a close throws nothing', async () => {
    const { channel } = await setUp()
    await Promise.all([channel.push(batch), channel.close(), channel.push(batch)])
  })

  it('a push after a close reaches no transport', async () => {
    const { channel } = await setUp()
    await channel.close()
    await channel.push(batch)
    assert.deepEqual(state.notifications, [])
  })

  it('answers an unknown method with method not found', async () => {
    const { client } = await setUp()
    await assert.rejects(
      client.request({ method: 'resources/list' }, ListResourcesResultSchema),
      /Method not found/,
    )
  })
})
