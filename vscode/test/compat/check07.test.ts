import assert from 'node:assert/strict'

import * as vscode from 'vscode'

import { deleteNotesComments, focused, notes, saveBox, showNotes } from '../integration/previewKit'
import { focusWorkbench, untilInWebview } from '../integration/webviewFrames'
import { until } from '../integration/window'
import { clickElement } from './kit'

describe('check 7', () => {
  before(focusWorkbench)
  after(deleteNotesComments)

  it('The Add button of the Markdown preview', async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors')
    await showNotes(new vscode.Selection(2, 0, 2, 0))
    await vscode.commands.executeCommand('markdown.showPreviewToSide', notes())
    await focused('panel')
    assert.ok(
      await untilInWebview('[data-line]', `return doc.querySelector('[data-line="2"]') !== null`),
      'the Markdown preview shows no text',
    )
    await clickElement('.editor-actions .action-label', 'Add Review Comment')
    assert.ok(
      await until(() => vscode.window.activeTextEditor?.document.uri.scheme === 'comment'),
      'the Add button did not open the comment box',
    )
    const [first] = await saveBox('From the Add button.')
    assert.ok(first !== undefined && first >= 0, 'the button saved no comment')
  })
})
