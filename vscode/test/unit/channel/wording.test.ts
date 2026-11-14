import { strict as assert } from 'node:assert'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'

import { ReviewChannel, TOOL_NAME } from '../../../src/channel/reviewChannel'
import type { ReviewBatch } from '../../../src/channel/schema'

const batch: ReviewBatch = {
  batchId: 'b7f2a91',
  branch: 'main',
  commit: '4f2c8b1c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6',
  comments: [
    {
      id: 'aaaaaaa1111111111111111111111111111111111',
      path: 'a.kt',
      startLine: 1,
      endLine: 1,
      revision: 'HEAD',
      text: 'one',
    },
    {
      id: 'bbbbbbb2222222222222222222222222222222222',
      path: 'b.kt',
      startLine: 2,
      endLine: 2,
      revision: 'HEAD',
      text: 'two',
    },
  ],
}

describe('channel wording (WordingTest.kt)', () => {
  const state: { channel?: ReviewChannel } = {}

  afterEach(async () => {
    await state.channel?.close()
  })

  const textAfter = async (ids: readonly string[]): Promise<string> => {
    const channel = new ReviewChannel(async () => undefined)
    state.channel = channel
    const client = new Client({ name: 'test-client', version: '0.0.0' })
    const [server, other] = InMemoryTransport.createLinkedPair()
    await channel.connect(server)
    await client.connect(other)
    await channel.push(batch)
    const result = (await client.callTool({ name: TOOL_NAME, arguments: { ids } })) as {
      content: { type: string; text?: string }[]
    }
    return result.content.map((part) => part.text ?? '').join('\n')
  }

  it('counts one comment in the singular', async () => {
    assert.equal(await textAfter(['aaaaaaa']), 'Reported 1 comment to VS Code as resolved.')
  })

  it('counts two comments in the plural', async () => {
    assert.equal(
      await textAfter(['aaaaaaa', 'bbbbbbb']),
      'Reported 2 comments to VS Code as resolved.',
    )
  })
})
