import assert from 'node:assert/strict'

import * as vscode from 'vscode'

import {
  deleteNotesComments,
  focused,
  notes,
  saveBox,
  showNotes,
  sourceBeside,
} from '../integration/previewKit'
import {
  chooseMenuItem,
  focusWorkbench,
  inWebview,
  rightClickAt,
  untilInWebview,
} from '../integration/webviewFrames'
import { until } from '../integration/window'

const PREVIEW = '[data-line]'

describe('check 6', () => {
  before(focusWorkbench)
  after(deleteNotesComments)

  it('The context menu of the Markdown preview', async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors')
    await showNotes(new vscode.Selection(0, 0, 0, 0))
    await vscode.commands.executeCommand('markdown.showPreviewToSide', notes())
    await focused('panel')
    assert.ok(
      await untilInWebview(PREVIEW, `return doc.querySelector('[data-line="2"]') !== null`),
      'the Markdown preview shows no text',
    )
    await rightClickAt(PREVIEW, '[data-line="2"]')
    const context = await inWebview(
      PREVIEW,
      `return doc.documentElement.getAttribute('data-vscode-context')`,
    )
    await chooseMenuItem('Add Review Comment')
    assert.ok(
      await until(() => vscode.window.activeTextEditor?.document.uri.scheme === 'comment'),
      `the comment box did not open: ${JSON.stringify(context)}`,
    )
    const selection = sourceBeside('panel')?.selection
    assert.ok(
      selection?.start.line === 2,
      `the source is not on the clicked line: ${JSON.stringify({ selection, context })}`,
    )
    assert.deepEqual(await saveBox('From the preview menu.'), [2, 2])
  })
})
