import { strict as assert } from 'node:assert'
import { existsSync } from 'node:fs'
import path from 'node:path'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import {
  StdioClientTransport,
  getDefaultEnvironment,
} from '@modelcontextprotocol/sdk/client/stdio.js'
import * as vscode from 'vscode'

import type { YreviewApi } from '../../src/extension'

describe('the bridge in the extension host', () => {
  it('starts the channel server with the runtime of VS Code and lists the five tools', async function test() {
    this.timeout(60_000)
    const extension =
      vscode.extensions.getExtension<YreviewApi>('yeskiy.yreview') ?? assert.fail('no extension')
    const api = await extension.activate()
    const lookup = (await api.bridge?.start()) ?? assert.fail('no bridge')
    if (lookup.kind !== 'available') return assert.fail(lookup.kind)
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [path.join(extension.extensionPath, 'dist', 'channel.js')],
      env: {
        ...getDefaultEnvironment(),
        ELECTRON_RUN_AS_NODE: '1',
        Y_REVIEW_BRIDGE_FILE: lookup.path,
      },
    })
    const client = new Client({ name: 'test', version: '1' })
    await client.connect(transport)
    const names = (await client.listTools()).tools.map((tool) => tool.name).sort()
    await client.close()
    return assert.deepEqual(names, [
      'review_add_comment',
      'review_list_comments',
      'review_open_comment',
      'review_resolve',
      'review_resolve_comment',
    ])
  })

  it('removes the discovery file when the bridge stops', async () => {
    const api = await (
      vscode.extensions.getExtension<YreviewApi>('yeskiy.yreview') ?? assert.fail('no extension')
    ).activate()
    const lookup = (await api.bridge?.start()) ?? assert.fail('no bridge')
    if (lookup.kind !== 'available') return assert.fail(lookup.kind)
    assert.equal(existsSync(lookup.path), true)
    await api.bridge?.stop()
    return assert.equal(existsSync(lookup.path), false)
  })
})
