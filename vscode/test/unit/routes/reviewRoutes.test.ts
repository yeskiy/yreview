import { strict as assert } from 'node:assert'
import { request } from 'node:http'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

import {
  COMMENTS_OPEN_PATH,
  COMMENTS_PATH,
  COMMENTS_RESOLVE_PATH,
  reviewRoutes,
} from '../../../src/bridge/reviewRoutes'
import { type BridgeAddress, BridgeServer } from '../../../src/bridge/server'
import { TOKEN_HEADER } from '../../../src/bridge/token'
import { BridgeClient } from '../../../src/channel/bridgeClient'
import { ReviewChannel } from '../../../src/channel/reviewChannel'
import {
  ADD_TOOL,
  LIST_TOOL,
  OPEN_TOOL,
  RESOLVE_COMMENT_TOOL,
  reviewTools as channelTools,
} from '../../../src/channel/reviewTools'
import { handleOf } from '../../../src/core/handles'
import { DISCUSS } from '../../../src/store/noteRefs'
import { COMMIT_A, toolFixture } from '../mcp/toolFixture'

type Fixture = ReturnType<typeof toolFixture>

interface Answer {
  readonly status: number
  readonly body: unknown
}

const RANGE = { startLine: 3, endLine: 5 }

const send = (
  address: BridgeAddress,
  path: string,
  options: { method?: string; body?: string; token?: string | null; host?: string } = {},
): Promise<Answer> =>
  new Promise((resolve, reject) => {
    const token = options.token === undefined ? address.token : options.token
    const sent = request(`${address.url}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        ...(token === null ? {} : { [TOKEN_HEADER]: token }),
        ...(options.host === undefined ? {} : { host: options.host }),
      },
    })
    sent.on('response', (response) => {
      const chunks: Buffer[] = []
      response.on('data', (chunk: Buffer) => chunks.push(chunk))
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        const json = (response.headers['content-type'] ?? '').startsWith('application/json')
        resolve({ status: response.statusCode ?? 0, body: json ? JSON.parse(text) : text })
      })
    })
    sent.on('error', reject)
    sent.end(options.body)
  })

const post = (address: BridgeAddress, path: string, body: unknown): Promise<Answer> =>
  send(address, path, {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })

const isRefusal = (answer: Answer): boolean =>
  answer.status === 400 &&
  typeof (answer.body as { error?: unknown }).error === 'string' &&
  Object.keys(answer.body as object).length === 1

describe('review routes of the VS Code bridge (spec 13.1)', () => {
  const held: { fixture?: Fixture; server?: BridgeServer; address?: BridgeAddress } = {}
  const fixture = (): Fixture => {
    assert.ok(held.fixture)
    return held.fixture
  }
  const address = (): BridgeAddress => {
    assert.ok(held.address)
    return held.address
  }

  beforeEach(async () => {
    held.fixture = toolFixture()
    held.server = new BridgeServer(async () => undefined, reviewRoutes(held.fixture.tools))
    held.address = await held.server.start()
  })

  afterEach(async () => {
    await held.server?.stop()
    held.fixture?.dispose()
  })

  const seed = () =>
    fixture().git.book.add(DISCUSS, COMMIT_A, 'src/a.ts', RANGE, 'Fix the shared one.')

  // --- Good bodies ---

  it('lists the comments on GET /comments', async () => {
    const stored = await seed()
    const answer = await send(address(), `${COMMENTS_PATH}?resolved=&analyses=false&local=true`)
    assert.equal(answer.status, 200)
    const rows = (answer.body as { comments: readonly { id: string }[] }).comments
    assert.deepEqual(
      rows.map((row) => row.id),
      [handleOf(stored.id)],
    )
  })

  it('adds a comment on POST /comments', async () => {
    const answer = await post(address(), COMMENTS_PATH, {
      path: 'src/a.ts',
      startLine: 1,
      endLine: 2,
      text: 'Rename this.',
    })
    assert.equal(answer.status, 200)
    assert.equal((answer.body as { path: string }).path, 'src/a.ts')
    assert.equal((answer.body as { revision: string }).revision, COMMIT_A)
    assert.equal(fixture().calls.add.length, 1)
  })

  it('resolves a comment on POST /comments/resolve', async () => {
    const handle = handleOf((await seed()).id)
    const answer = await post(address(), COMMENTS_RESOLVE_PATH, { id: handle })
    assert.deepEqual(answer, { status: 200, body: { id: handle, resolved: true } })
  })

  it('opens a comment on POST /comments/open', async () => {
    const handle = handleOf((await seed()).id)
    const answer = await post(address(), COMMENTS_OPEN_PATH, { id: handle })
    assert.deepEqual(answer, {
      status: 200,
      body: { id: handle, opened: 'file', path: 'src/a.ts', line: 3, revision: COMMIT_A },
    })
  })

  it('answers 200 with the error when the tool refuses the work', async () => {
    const answer = await post(address(), COMMENTS_RESOLVE_PATH, { id: 'yzzzz' })
    assert.deepEqual(answer, {
      status: 200,
      body: { error: 'No review comment has the id yzzzz.' },
    })
  })

  // --- Bodies and queries that break the route rule ---

  it('refuses a body that is not an object', async () => {
    const answers = await Promise.all(
      ['[1]', '"id"', 'null', 'not json', ''].map((body) =>
        post(address(), COMMENTS_RESOLVE_PATH, body),
      ),
    )
    answers.forEach((answer) => assert.ok(isRefusal(answer), JSON.stringify(answer)))
  })

  it('refuses a body with an unknown key', async () => {
    const answers = await Promise.all([
      post(address(), COMMENTS_RESOLVE_PATH, { id: 'yzzzz', extra: 1 }),
      post(address(), COMMENTS_OPEN_PATH, { id: 'yzzzz', extra: 1 }),
      post(address(), COMMENTS_PATH, {
        path: 'src/a.ts',
        startLine: 1,
        endLine: 1,
        text: 'x',
        extra: 1,
      }),
    ])
    answers.forEach((answer) => assert.ok(isRefusal(answer), JSON.stringify(answer)))
    assert.equal(fixture().calls.add.length, 0)
  })

  it('refuses a value of a wrong type', async () => {
    const answers = await Promise.all([
      post(address(), COMMENTS_RESOLVE_PATH, { id: 5 }),
      post(address(), COMMENTS_OPEN_PATH, { id: '' }),
      post(address(), COMMENTS_OPEN_PATH, { id: 'y'.repeat(201) }),
      post(address(), COMMENTS_PATH, { path: 'src/a.ts', startLine: '1', endLine: 1, text: 'x' }),
      post(address(), COMMENTS_PATH, { path: 'src/a.ts', startLine: 1, endLine: 1.5, text: 'x' }),
      post(address(), COMMENTS_PATH, { path: 1, startLine: 1, endLine: 1, text: 'x' }),
      post(address(), COMMENTS_PATH, { path: 'src/a.ts', startLine: 1, endLine: 1, text: null }),
      post(address(), COMMENTS_PATH, {
        path: 'a'.repeat(1025),
        startLine: 1,
        endLine: 1,
        text: 'x',
      }),
      post(address(), COMMENTS_PATH, {
        path: 'src/a.ts',
        startLine: 1,
        endLine: 1,
        text: 'x'.repeat(20_001),
      }),
    ])
    answers.forEach((answer) => assert.ok(isRefusal(answer), JSON.stringify(answer)))
    assert.equal(fixture().calls.add.length, 0)
  })

  it('refuses a query value other than true, false or empty', async () => {
    const answers = await Promise.all(
      ['resolved=yes', 'analyses=1', 'local=TRUE'].map((query) =>
        send(address(), `${COMMENTS_PATH}?${query}`),
      ),
    )
    answers.forEach((answer) => assert.ok(isRefusal(answer), JSON.stringify(answer)))
  })

  // --- Checks of the bridge ---

  it('answers 405 for GET /comments/resolve', async () => {
    assert.equal((await send(address(), COMMENTS_RESOLVE_PATH)).status, 405)
  })

  it('answers 401 for a route call without the token', async () => {
    const answers = await Promise.all([
      send(address(), COMMENTS_PATH, { token: null }),
      send(address(), COMMENTS_OPEN_PATH, { method: 'POST', body: '{"id":"x"}', token: null }),
    ])
    assert.deepEqual(
      answers.map((answer) => answer.status),
      [401, 401],
    )
  })

  it('answers 403 for a Host header other than the loopback address of the bridge', async () => {
    const good = await send(address(), COMMENTS_PATH, { host: `localhost:${address().port}` })
    const bad = await send(address(), COMMENTS_PATH, { host: `example.com:${address().port}` })
    assert.equal(good.status, 200)
    assert.equal(bad.status, 403)
  })

  // --- The channel server reaches the routes ---

  it('carries each of the four tools from the channel to the routes and back', async () => {
    const handle = handleOf((await seed()).id)
    const bridge = new BridgeClient({
      bridgeUrl: address().url,
      token: address().token,
      onError: () => undefined,
    })
    const channel = new ReviewChannel(async () => undefined, channelTools(bridge))
    const client = new Client({ name: 'test-client', version: '0.0.0' })
    const [server, other] = InMemoryTransport.createLinkedPair()
    await channel.connect(server)
    await client.connect(other)
    const call = async (name: string, args: Record<string, unknown>): Promise<unknown> => {
      const result = (await client.callTool({ name, arguments: args })) as CallToolResult
      assert.notEqual(result.isError, true, JSON.stringify(result))
      const [part] = result.content
      assert.ok(part?.type === 'text')
      return JSON.parse(part.text)
    }
    try {
      const listed = (await call(LIST_TOOL, {})) as { comments: readonly { id: string }[] }
      assert.deepEqual(
        listed.comments.map((row) => row.id),
        [handle],
      )
      assert.equal(((await call(OPEN_TOOL, { id: handle })) as { opened: string }).opened, 'file')
      assert.deepEqual(await call(RESOLVE_COMMENT_TOOL, { id: handle }), {
        id: handle,
        resolved: true,
      })
      const added = (await call(ADD_TOOL, {
        path: 'src/a.ts',
        startLine: 1,
        endLine: 1,
        text: 'Added by the agent.',
      })) as { path: string; shared: boolean }
      assert.deepEqual([added.path, added.shared], ['src/a.ts', true])
    } finally {
      await client.close()
      await channel.close()
      bridge.stop()
    }
  })
})
