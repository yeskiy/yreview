import assert from 'node:assert/strict'

import * as vscode from 'vscode'

import { installedExtensions } from '../../../src/saveKey'
import { findSaveKeyConflicts } from '../../../src/saveKeyCore'

import { until } from '../window'

const KEYMAP_ID = 'k--kato.intellij-idea-keybindings'

describe('save key offer with the real IntelliJ IDEA Keybindings extension', () => {
  before(async function installKeymap() {
    this.timeout(300000)
    if (vscode.extensions.getExtension(KEYMAP_ID) === undefined)
      await vscode.commands.executeCommand('workbench.extensions.installExtension', KEYMAP_ID)
    assert.ok(
      await until(() => vscode.extensions.getExtension(KEYMAP_ID) !== undefined, 240),
      'the keymap extension did not install in the test profile',
    )
  })

  it('finds the Ctrl+Enter binding of the keymap on each platform', () => {
    ;['win32', 'linux', 'darwin'].forEach((platform) => {
      const found = findSaveKeyConflicts(installedExtensions(), platform)
      assert.ok(
        found.some((conflict) => conflict.extension === 'IntelliJ IDEA Keybindings'),
        `${platform}: ${JSON.stringify(found)}`,
      )
    })
  })
})
