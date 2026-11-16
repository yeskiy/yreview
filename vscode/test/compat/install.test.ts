import assert from 'node:assert/strict'

import * as vscode from 'vscode'

import { config } from './kit'

describe('install', () => {
  it('The VSIX from the CLI activates', async () => {
    const extension = vscode.extensions.getExtension('yeskiy.yreview') ?? assert.fail('not found')
    await extension.activate()
    assert.equal(extension.isActive, true)
    assert.equal((extension.packageJSON as { version?: string }).version, config().version)
    assert.ok((await vscode.commands.getCommands(true)).includes('yreview.showLog'))
  })
})
