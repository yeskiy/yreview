import assert from 'node:assert/strict'
import { setTimeout as wait } from 'node:timers/promises'

import * as vscode from 'vscode'

import { evaluate, pressSaveKey, workbench } from '../integration/keymap/devtools'
import {
  REVIEW_PAGE,
  focusWorkbench,
  inWebview,
  pressAddKey,
  requireOsFocus,
  untilInWebview,
  untilKeyboardIn,
} from '../integration/webviewFrames'
import { until } from '../integration/window'
import { deleteReviewComments, eventually, openReviewPreview, savedInReview } from './kit'

const previewActive = (): boolean => {
  const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input
  return input instanceof vscode.TabInputWebview && input.viewType.endsWith('yreview.preview')
}
const untilInWorkbench = async (check: string, tries = 40): Promise<boolean> =>
  (await evaluate(await workbench(), check)) === true ||
  (tries > 0 && wait(250).then(() => untilInWorkbench(check, tries - 1)))

describe('check 13', () => {
  before(focusWorkbench)
  after(deleteReviewComments)

  it('The key in the review preview saves lines', async function run() {
    requireOsFocus(this)
    await vscode.commands.executeCommand('workbench.action.closeAllEditors')
    await openReviewPreview()
    assert.ok(
      (await until(previewActive)) &&
        (await untilInWorkbench(`!document.activeElement?.closest('.monaco-editor')`)),
      'the add key does not reach the review preview',
    )
    // The block of data-line 2 holds the three lines of the first paragraph.
    await inWebview(
      REVIEW_PAGE,
      `const range = doc.createRange()
      range.selectNodeContents(doc.querySelector('[data-line="2"]'))
      doc.getSelection().removeAllRanges()
      doc.getSelection().addRange(range)
      return doc.getSelection().toString()`,
    )
    await pressAddKey()
    assert.ok(
      (await until(previewActive)) && (await untilKeyboardIn(REVIEW_PAGE, '.yreview-box textarea')),
      'the box has no focus',
    )
    await inWebview(
      REVIEW_PAGE,
      `const area = doc.querySelector('.yreview-box textarea')
      area.value = 'Key probe.'
      area.dispatchEvent(new Event('input', { bubbles: true }))
      return true`,
    )
    await pressSaveKey()
    assert.ok(
      await untilInWebview(REVIEW_PAGE, `return doc.querySelector('.yreview-box') === null`),
      'the box stays open',
    )
    assert.ok(
      await eventually(async () =>
        (await savedInReview()).some((one) => one.text === 'Key probe.' && one.lines[0] === 2),
      ),
      `the key saved no comment on the selected lines: ${JSON.stringify(await savedInReview())}`,
    )
  })
})
