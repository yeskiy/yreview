import assert from 'node:assert/strict'

import * as vscode from 'vscode'

import { evaluate, workbench } from '../integration/keymap/devtools'
import { api } from '../integration/previewKit'
import { config, eventually } from './kit'

/** The text of the output channel of Yreview, from its document or from the visible panel. */
const shownLog = async (): Promise<string> => {
  const document = vscode.workspace.textDocuments.find(
    (one) => one.uri.scheme === 'output' && one.getText().includes('Yreview started.'),
  )
  return (
    document?.getText() ??
    String(
      await evaluate(
        await workbench(),
        `[...document.querySelectorAll('.output-view .view-line')].map((n) => n.textContent).join('\\n')`,
      ),
    )
  )
}

describe('check 1', () => {
  it('Show Log shows the start and the host', async () => {
    await api()
    await vscode.commands.executeCommand('yreview.showLog')
    await vscode.commands.executeCommand('workbench.action.toggleMaximizedPanel')
    const host = new RegExp(`host +${config().expectedHost}\\b`)
    const seen = { text: '' }
    const shown = await eventually(async () => {
      seen.text = await shownLog()
      return seen.text.includes('Yreview started.') && host.test(seen.text)
    })
    assert.ok(shown, `the log does not show the start and the host: ${seen.text.slice(0, 1500)}`)
  })
})
