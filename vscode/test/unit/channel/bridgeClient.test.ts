import { strict as assert } from 'node:assert'

import { BridgeClient, MAX_EVENT_CHARS } from '../../../src/channel/bridgeClient'
import {
  MAX_COMMENTS,
  MAX_TEXT,
  type ReviewBatch,
  type ReviewComment,
} from '../../../src/channel/schema'
import { FakeBridge, waitFor } from './fakeBridge'

const fullId = 'c3f9a12aabbccddeeff00112233445566778899a'
const SESSION_KEY = 'aaaaaaaaaaaaaaaa'
const WRONG_TOKEN = 'a-wrong-token-of-32-characters-00'
const RESOLVE_TIMEOUT_MS = 400
const GIVE_UP_MS = 3_000

const first: ReviewComment = {
  id: fullId,
  path: 'src/main/kotlin/Parser.kt',
  startLine: 88,
  endLine: 94,
  revision: 'HEAD',
  text: 'This branch never runs when the input is empty.',
}
const batch: ReviewBatch = {
  batchId: 'b7f2a91',
  branch: 'feat/channel-server',
  commit: '4f2c8b1c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6',
  comments: [first],
}

const failureOf = async (work: Promise<unknown>): Promise<Error> => {
  const failure = await work.then(
    () => undefined,
    (error: unknown) => error,
  )
  assert.ok(failure instanceof Error, 'the call must fail')
  return failure
}

describe('channel bridge client (BridgeClientTest.kt)', function suite() {
  this.timeout(60_000)

  const state: {
    bridge: FakeBridge
    client?: BridgeClient
    batches: ReviewBatch[]
    errors: Error[]
    lost: string[]
  } = { bridge: new FakeBridge(), batches: [], errors: [], lost: [] }

  beforeEach(async () => {
    state.bridge = new FakeBridge()
    state.client = undefined
    state.batches = []
    state.errors = []
    state.lost = []
    await state.bridge.start()
  })

  afterEach(async () => {
    state.client?.stop()
    await state.bridge.close()
  })

  const connect = (token = state.bridge.token, sessionKey?: string): BridgeClient => {
    const client = new BridgeClient({
      bridgeUrl: state.bridge.url,
      token,
      ...(sessionKey === undefined ? {} : { sessionKey }),
      onError: (error) => state.errors.push(error),
      retryDelayMs: 20,
      resolveTimeoutMs: RESOLVE_TIMEOUT_MS,
      onLost: async (reason) => {
        state.lost.push(reason)
      },
    })
    state.client = client
    client.start(async (pushed) => {
      state.batches.push(pushed)
    })
    return client
  }

  it('receives a batch that the bridge pushed', async () => {
    connect()
    await state.bridge.waitForStream()
    state.bridge.push(batch)
    await waitFor('the batch', () => state.batches.length === 1)
    assert.equal(state.batches[0]?.batchId, 'b7f2a91')
  })

  it('sends the token on the events request', async () => {
    connect()
    await state.bridge.waitForStream()
    assert.deepEqual(state.bridge.streamTokens, [state.bridge.token])
  })

  it('reports an error when the bridge refuses the token', async () => {
    connect(WRONG_TOKEN)
    await waitFor('the error', () => state.errors.length > 0)
    assert.match(state.errors[0]?.message ?? '', /401/)
  })

  it('reports an error and keeps the stream open when a batch does not match the contract', async () => {
    connect()
    await state.bridge.waitForStream()
    state.bridge.pushRaw('{"batchId":"b1","branch":"main"}')
    await waitFor('the error', () => state.errors.length > 0)
    state.bridge.push(batch)
    await waitFor('the good batch', () => state.batches.length === 1)
    assert.equal(state.batches[0]?.batchId, 'b7f2a91')
  })

  it('reports an error when a pushed event is not JSON', async () => {
    connect()
    await state.bridge.waitForStream()
    state.bridge.pushRaw('this is not json')
    await waitFor('the error', () => state.errors.length > 0)
    assert.equal(state.errors.length, 1)
    assert.match(state.errors[0]?.message ?? '', /not JSON/)
  })

  it('tells the model once about a batch at the schema maximum and reads the next batch', async () => {
    const largest = {
      ...batch,
      comments: Array.from({ length: MAX_COMMENTS }, (_, at) => ({
        ...first,
        id: `c${at + 1}`,
        text: '"'.repeat(MAX_TEXT),
      })),
    }
    assert.ok(JSON.stringify(largest).length > MAX_EVENT_CHARS)
    connect()
    await state.bridge.waitForStream()
    state.bridge.pushRaw('x'.repeat(MAX_EVENT_CHARS + 10))
    state.bridge.push(batch)
    await waitFor('the good batch', () => state.batches.length === 1)
    assert.deepEqual(
      state.batches.map((pushed) => pushed.batchId),
      ['b7f2a91'],
    )
    assert.equal(state.lost.length, 1)
    assert.match(state.lost[0] ?? '', new RegExp(`more than ${MAX_EVENT_CHARS} characters`))
    assert.equal(state.errors.length, 1)
  })

  it('reads a batch just under the event limit', async () => {
    const text = 'x'.repeat(MAX_TEXT)
    const count = Math.floor(
      (MAX_EVENT_CHARS - 1000) / (JSON.stringify({ ...first, text }).length + 1),
    )
    const large = {
      ...batch,
      comments: Array.from({ length: count }, (_, at) => ({ ...first, id: `c${at + 1}`, text })),
    }
    assert.ok(JSON.stringify(large).length < MAX_EVENT_CHARS)
    connect()
    await state.bridge.waitForStream()
    state.bridge.push(large)
    await waitFor('the large batch', () => state.batches.length === 1)
    assert.equal(state.batches[0]?.comments.length, count)
    assert.deepEqual(state.lost, [])
  })

  it('tells the model about an event that is not JSON', async () => {
    connect()
    await state.bridge.waitForStream()
    state.bridge.pushRaw('this is not json')
    await waitFor('the lost event', () => state.lost.length > 0)
    assert.equal(state.lost.length, 1)
    assert.match(state.lost[0] ?? '', /not JSON/)
  })

  it('opens the stream again after the bridge dropped it', async () => {
    connect()
    await state.bridge.waitForStream()
    state.bridge.dropStreams()
    await waitFor('the second stream', () => state.bridge.streamTokens.length === 2)
    await state.bridge.waitForStream()
    state.bridge.push(batch)
    await waitFor('the batch after the reconnect', () => state.batches.length === 1)
    assert.equal(state.batches.length, 1)
  })

  it('posts the resolved ids to the bridge', async () => {
    await connect().resolve([fullId])
    assert.deepEqual(state.bridge.resolved, [[fullId]])
  })

  it('sends the token on the resolve request', async () => {
    await connect().resolve([fullId])
    assert.deepEqual(state.bridge.resolveTokens, [state.bridge.token])
  })

  it('fails the resolve call when the bridge refuses the token', async () => {
    assert.match((await failureOf(connect(WRONG_TOKEN).resolve([fullId]))).message, /401/)
  })

  it('the reason of a refused report carries the text of the bridge', async () => {
    state.bridge.refusal = 'The comment yabc12 is gone.'
    assert.equal(
      (await failureOf(connect().resolve([fullId]))).message,
      'the bridge refused the report with status 409: The comment yabc12 is gone.',
    )
  })

  it('the reason of a refused report keeps a short part of a long text', async () => {
    state.bridge.refusal = 'x'.repeat(5000)
    const { message } = await failureOf(connect().resolve([fullId]))
    assert.ok(message.length < 600, `the reason has ${message.length} characters`)
  })

  it('fails the resolve call when the bridge is gone', async () => {
    const client = connect()
    await state.bridge.close()
    assert.notEqual(
      (await failureOf(client.resolve([fullId]))).message,
      '',
      'the reason must reach the caller',
    )
  })

  it('sends the session key on the event stream and on the resolve call', async () => {
    const client = connect(state.bridge.token, SESSION_KEY)
    await state.bridge.waitForStream()
    await client.resolve([fullId])
    assert.deepEqual(state.bridge.streamKeys, [SESSION_KEY])
    assert.deepEqual(state.bridge.resolveKeys, [SESSION_KEY])
  })

  it('sends no session header when it has no key', async () => {
    // A session that started before the key existed must still reach the bridge.
    const client = connect()
    await state.bridge.waitForStream()
    await client.resolve([fullId])
    assert.deepEqual(state.bridge.streamKeys, [''])
    assert.deepEqual(state.bridge.resolveKeys, [''])
  })

  it('gives up the resolve call when the bridge takes the report and never answers', async () => {
    state.bridge.stallResolve = true
    const client = connect()
    const started = Date.now()
    const failure = await failureOf(client.resolve([fullId]))
    const waited = Date.now() - started
    assert.match(failure.message, /did not answer/)
    assert.ok(
      waited < GIVE_UP_MS,
      `the client waited ${waited} ms, and it must give up much sooner`,
    )
  })

  it('the reason of a resolve call that gave up carries no token', async () => {
    state.bridge.stallResolve = true
    const failure = await failureOf(connect().resolve([fullId]))
    assert.ok(!failure.message.includes(state.bridge.token), 'a message must never carry the token')
  })
})
