import assert from 'node:assert/strict'

import * as vscode from 'vscode'

import { REVIEW_PAGE, inWebview } from '../integration/webviewFrames'
import { openReviewPreview } from './kit'

describe('check 12', () => {
  it('The review preview opens and renders', async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors')
    await openReviewPreview()
    const page = (await inWebview(
      REVIEW_PAGE,
      `return { heading: doc.querySelector('h1')?.textContent ?? '',
        code: doc.querySelector('pre code') !== null,
        injected: doc.defaultView.yreviewInjected === true }`,
    )) as { heading: string; code: boolean; injected: boolean }
    assert.match(page.heading, /Review/)
    assert.equal(page.code, true, 'the fence has no code block')
    assert.equal(page.injected, false, 'the page ran a script of the document')
  })
})
