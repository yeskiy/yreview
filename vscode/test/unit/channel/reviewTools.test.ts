import { strict as assert } from 'node:assert'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

import { type Answer, BridgeClient } from '../../../src/channel/bridgeClient'
import { ReviewChannel, TOOL_NAME } from '../../../src/channel/reviewChannel'
import {
  ADD_TOOL,
  BAD_TOOL_INPUT,
  type BridgeCalls,
  LIST_TOOL,
  OPEN_TOOL,
  RESOLVE_COMMENT_TOOL,
  reviewTools,
} from '../../../src/channel/reviewTools'

interface Sent {
  readonly method: string
  readonly path: string
  readonly body?: unknown
}

const recorder = (answer: Answer = { status: 200, text: '{"ok":true}' }) => {
  const sent: Sent[] = []
  const bridge: BridgeCalls = {
    request: async (method, path, body) => {
      sent.push(body === undefined ? { method, path } : { method, path, body })
      return answer
    },
  }
  return { sent, bridge }
}

const call = async (
  bridge: BridgeCalls,
  name: string,
  args?: Record<string, unknown>,
): Promise<CallToolResult> => {
  const tool = reviewTools(bridge).find((candidate) => candidate.definition.name === name)
  assert.ok(tool, `the tool ${name} must exist`)
  return tool.call(args)
}

const textOf = (result: CallToolResult): string =>
  result.content.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('\n')

describe('channel review tools (ReviewToolset.kt)', () => {
  it('offers the four tools of the IntelliJ toolset', () => {
    assert.deepEqual(
      reviewTools(recorder().bridge).map((tool) => tool.definition.name),
      [LIST_TOOL, RESOLVE_COMMENT_TOOL, ADD_TOOL, OPEN_TOOL],
    )
  })

  it('lists the open comments with the default flags', async () => {
    const { sent, bridge } = recorder()
    await call(bridge, LIST_TOOL, {})
    assert.deepEqual(sent, [
      { method: 'GET', path: '/comments?resolved=false&analyses=false&local=true' },
    ])
  })

  it('passes the flags of the list call to the route', async () => {
    const { sent, bridge } = recorder()
    await call(bridge, LIST_TOOL, { resolved: true, includeAnalyses: true, includeLocal: false })
    assert.deepEqual(sent, [
      { method: 'GET', path: '/comments?resolved=true&analyses=true&local=false' },
    ])
  })

  it('resolves one comment through its route', async () => {
    const { sent, bridge } = recorder()
    await call(bridge, RESOLVE_COMMENT_TOOL, { id: 'yd8pmsq91' })
    assert.deepEqual(sent, [
      { method: 'POST', path: '/comments/resolve', body: { id: 'yd8pmsq91' } },
    ])
  })

  it('opens one comment through its route', async () => {
    const { sent, bridge } = recorder()
    await call(bridge, OPEN_TOOL, { id: 'yd8pmsq91' })
    assert.deepEqual(sent, [{ method: 'POST', path: '/comments/open', body: { id: 'yd8pmsq91' } }])
  })

  it('adds one comment through its route with only the known fields', async () => {
    const { sent, bridge } = recorder()
    await call(bridge, ADD_TOOL, {
      path: 'src/a.ts',
      startLine: 3,
      endLine: 4,
      text: 'Check this.',
      extra: 'x',
    })
    assert.deepEqual(sent, [
      {
        method: 'POST',
        path: '/comments',
        body: { path: 'src/a.ts', startLine: 3, endLine: 4, text: 'Check this.' },
      },
    ])
  })

  it('gives the answer of the route as the text of a good result', async () => {
    const result = await call(
      recorder({ status: 200, text: '{"id":"yd8pmsq91","resolved":true}' }).bridge,
      RESOLVE_COMMENT_TOOL,
      {
        id: 'yd8pmsq91',
      },
    )
    assert.equal(result.isError, undefined)
    assert.equal(textOf(result), '{"id":"yd8pmsq91","resolved":true}')
  })

  it('marks a refusal of the route as an error result', async () => {
    const result = await call(
      recorder({ status: 200, text: '{"error":"No comment has this id."}' }).bridge,
      OPEN_TOOL,
      {
        id: 'nothing',
      },
    )
    assert.equal(result.isError, true)
    assert.equal(textOf(result), '{"error":"No comment has this id."}')
  })

  it('marks an answer outside 2xx as an error result', async () => {
    const result = await call(
      recorder({ status: 400, text: '{"error":"bad body"}' }).bridge,
      ADD_TOOL,
      {
        path: 'a.ts',
        startLine: 1,
        endLine: 1,
        text: 'x',
      },
    )
    assert.equal(result.isError, true)
  })

  const badInputs: readonly [string, Record<string, unknown> | undefined][] = [
    [LIST_TOOL, { resolved: 'yes' }],
    [LIST_TOOL, { includeLocal: 1 }],
    [RESOLVE_COMMENT_TOOL, { id: 7 }],
    [RESOLVE_COMMENT_TOOL, { id: '' }],
    [RESOLVE_COMMENT_TOOL, undefined],
    [OPEN_TOOL, { id: 'x'.repeat(201) }],
    [ADD_TOOL, { path: 'a.ts', startLine: 1.5, endLine: 2, text: 'x' }],
    [ADD_TOOL, { path: '', startLine: 1, endLine: 2, text: 'x' }],
    [ADD_TOOL, { path: 'a.ts', startLine: 1, endLine: 2, text: 'x'.repeat(20_001) }],
  ]

  badInputs.forEach(([name, args]) => {
    it(`refuses bad input to ${name} (${JSON.stringify(args)?.slice(0, 40)}) and calls nothing`, async () => {
      const { sent, bridge } = recorder()
      const result = await call(bridge, name, args)
      assert.equal(result.isError, true)
      assert.equal(textOf(result), BAD_TOOL_INPUT)
      assert.deepEqual(sent, [])
    })
  })

  it('a bridge that does not answer gives an error text with no token', async () => {
    const token = 'a-token-of-32-characters-000000000'
    const closed = createServer()
    await new Promise<void>((resolve) => {
      closed.listen(0, '127.0.0.1', resolve)
    })
    const { port } = closed.address() as AddressInfo
    await new Promise<void>((resolve) => {
      closed.close(() => resolve())
    })
    const client = new BridgeClient({
      bridgeUrl: `http://127.0.0.1:${port}`,
      token,
      onError: () => undefined,
    })
    const result = await call(client, LIST_TOOL, {})
    assert.equal(result.isError, true)
    assert.ok('error' in (JSON.parse(textOf(result)) as Record<string, unknown>))
    assert.ok(!textOf(result).includes(token))
  })

  it('reaches the model through the channel next to review_resolve', async () => {
    const { sent, bridge } = recorder()
    const channel = new ReviewChannel(async () => undefined, reviewTools(bridge))
    const client = new Client({ name: 'test-client', version: '0.0.0' })
    const [server, other] = InMemoryTransport.createLinkedPair()
    await channel.connect(server)
    await client.connect(other)
    try {
      assert.deepEqual(
        (await client.listTools()).tools.map((tool) => tool.name),
        [TOOL_NAME, LIST_TOOL, RESOLVE_COMMENT_TOOL, ADD_TOOL, OPEN_TOOL],
      )
      await client.callTool({ name: OPEN_TOOL, arguments: { id: 'yd8pmsq91' } })
      assert.deepEqual(sent, [
        { method: 'POST', path: '/comments/open', body: { id: 'yd8pmsq91' } },
      ])
    } finally {
      await channel.close()
    }
  })
})
