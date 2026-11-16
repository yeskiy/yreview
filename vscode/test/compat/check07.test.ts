import assert from 'node:assert/strict'
import { setTimeout as wait } from 'node:timers/promises'

import * as vscode from 'vscode'

import { deleteNotesComments, focused, notes, saveBox, showNotes } from '../integration/previewKit'
import { chooseMenuItem, focusWorkbench, untilInWebview } from '../integration/webviewFrames'
import { until } from '../integration/window'
import { clickElement, pointOf } from './kit'

const ACTIONS = '.editor-group-container.active .editor-actions .action-label'

describe('check 7', () => {
  before(focusWorkbench)
  after(deleteNotesComments)

  it('The Add button of the Markdown preview', async function run() {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors')
    await showNotes(new vscode.Selection(2, 0, 2, 0))
    await vscode.commands.executeCommand('markdown.showPreviewToSide', notes())
    await focused('panel')
    assert.ok(
      await untilInWebview('[data-line]', `return doc.querySelector('[data-line="2"]') !== null`),
      'the Markdown preview shows no text',
    )
    // An editor can put the buttons of an extension under More Actions of the title bar.
    const shown = await wait(2000).then(() => pointOf(ACTIONS, 'Add Review Comment'))
    if (shown === null) {
      await clickElement(ACTIONS, 'More Actions')
      await chooseMenuItem('Add Review Comment')
      const test = this.test ?? assert.fail()
      test.title += ' (note: the button is under More Actions)'
    } else await clickElement(ACTIONS, 'Add Review Comment')
    assert.ok(
      await until(() => vscode.window.activeTextEditor?.document.uri.scheme === 'comment'),
      'the Add button did not open the comment box',
    )
    const [first] = await saveBox('From the Add button.')
    assert.ok(first !== undefined && first >= 0, 'the button saved no comment')
  })
})
