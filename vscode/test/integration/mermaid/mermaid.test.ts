import assert from 'node:assert/strict'
import path from 'node:path'

import * as vscode from 'vscode'

import { REVIEW_PAGE, untilInWebview } from '../webviewFrames'
import { until } from '../window'

const BUILT_IN = 'vscode.mermaid-markdown-features'
const MARKETPLACE = 'bierner.markdown-mermaid'
const BUILT_IN_PAGE = 'body.vscode-body:not([data-yreview-preview])'
const flow = (): vscode.Uri =>
  vscode.Uri.file(
    path.join(
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? assert.fail('no workspace'),
      'flow.md',
    ),
  )
const SVG = `return doc.querySelector('.mermaid svg, svg[id^="mermaid"], svg[aria-roledescription]') !== null`

/** A Marketplace download fails at times, so the install tries a second time. */
const install = (): Thenable<unknown> =>
  vscode.commands
    .executeCommand('workbench.extensions.installExtension', MARKETPLACE)
    .then(undefined, () =>
      vscode.commands.executeCommand('workbench.extensions.installExtension', MARKETPLACE),
    )

describe('Mermaid in the review preview', () => {
  before(async function installMermaid() {
    this.timeout(300000)
    if (vscode.extensions.getExtension(BUILT_IN) !== undefined) return
    await install()
    assert.ok(
      await until(() => vscode.extensions.getExtension(MARKETPLACE) !== undefined, 240),
      'the Mermaid extension did not install in the test profile',
    )
  })

  afterEach(() => vscode.commands.executeCommand('workbench.action.closeAllEditors'))

  it('draws a Mermaid block in the review preview and in the built-in preview', async function mermaid() {
    this.timeout(120000)
    await vscode.window.showTextDocument(flow(), { viewColumn: vscode.ViewColumn.One })
    await vscode.commands.executeCommand('yreview.openReviewPreview')
    assert.ok(
      await untilInWebview(REVIEW_PAGE, SVG, 120),
      'no Mermaid drawing in the review preview',
    )
    await vscode.commands.executeCommand('workbench.action.closeAllEditors')
    await vscode.window.showTextDocument(flow(), { viewColumn: vscode.ViewColumn.One })
    await vscode.commands.executeCommand('markdown.showPreviewToSide')
    assert.ok(
      await untilInWebview(BUILT_IN_PAGE, SVG, 120),
      'no Mermaid drawing in the built-in preview',
    )
  })

  it('draws the block again after an edit', async function edit() {
    this.timeout(120000)
    const editor = await vscode.window.showTextDocument(flow(), {
      viewColumn: vscode.ViewColumn.One,
    })
    await vscode.commands.executeCommand('yreview.openReviewPreview')
    assert.ok(await untilInWebview(REVIEW_PAGE, SVG, 120), 'no Mermaid drawing before the edit')
    const change = new vscode.WorkspaceEdit()
    change.insert(flow(), new vscode.Position(5, 0), '  B-->C\n')
    assert.ok(await vscode.workspace.applyEdit(change), 'the edit did not apply')
    assert.ok(
      await untilInWebview(
        REVIEW_PAGE,
        `return [...doc.querySelectorAll('svg text, svg span, svg p')].some((node) => node.textContent?.trim() === 'C')`,
        120,
      ),
      'no new node in the Mermaid drawing after the edit',
    )
    await vscode.window.showTextDocument(editor.document, { viewColumn: vscode.ViewColumn.One })
    await vscode.commands.executeCommand('workbench.action.files.revert')
  })
})
