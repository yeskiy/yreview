import assert from 'node:assert/strict'

import * as vscode from 'vscode'

import { until } from '../integration/window'
import { config } from './kit'

describe('install', () => {
  it('The VSIX from the CLI activates', async () => {
    // An editor can scan the installed extensions after the test host starts.
    assert.ok(
      await until(() => vscode.extensions.getExtension('yeskiy.yreview') !== undefined, 120),
      'the editor does not list the installed extension',
    )
    const extension = vscode.extensions.getExtension('yeskiy.yreview') ?? assert.fail()
    await extension.activate()
    assert.equal(extension.isActive, true)
    assert.equal((extension.packageJSON as { version?: string }).version, config().version)
    assert.ok((await vscode.commands.getCommands(true)).includes('yreview.showLog'))
  })
})
