import assert from 'node:assert/strict'

import * as vscode from 'vscode'

describe('activation', () => {
  it('activates on its first command and registers it', async () => {
    await vscode.commands.executeCommand('yreview.showLog')
    const extension = vscode.extensions.getExtension('yeskiy.yreview')
    assert.equal(extension?.isActive, true)
    assert.ok((await vscode.commands.getCommands(true)).includes('yreview.showLog'))
  })
})
