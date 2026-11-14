import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import * as vscode from 'vscode'

import type { YreviewApi } from '../../src/extension'
import type { PreviewHost } from '../../src/preview/previewHost'
import { commentLink } from '../../src/preview/commentLink'

const workspace = (): string =>
  vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? assert.fail('no workspace')
const git = (...args: string[]): string =>
  execFileSync('git', args, { cwd: workspace(), encoding: 'utf8' })
const api = async (): Promise<YreviewApi> =>
  (
    vscode.extensions.getExtension<YreviewApi>('yeskiy.yreview') ?? assert.fail('no extension')
  ).activate()
const preview = async (): Promise<PreviewHost> =>
  (await api()).preview ?? assert.fail('the preview is off')
const notes = (): string => path.join(workspace(), 'src', 'notes.md')
const render = async (): Promise<string> =>
  vscode.commands.executeCommand<string>(
    'markdown.api.render',
    await vscode.workspace.openTextDocument(vscode.Uri.file(notes())),
  )
const link = (file: string, line: number): vscode.Uri =>
  vscode.Uri.parse(commentLink(vscode.env.uriScheme, file, line))
const active = (): string =>
  (vscode.window.activeTextEditor?.document.uri.fsPath ?? '').toLowerCase()
const noteRefs = (): string => git('for-each-ref', 'refs/notes')

describe('comments from the Markdown preview', () => {
  it('adds a comment link to each block of the rendered preview', async () => {
    const html = await render()
    assert.equal(html.split('class="yreview-add"').length - 1, 3)
    assert.match(
      html,
      new RegExp(`href="${vscode.env.uriScheme}://yeskiy\\.yreview/comment\\?file=`),
    )
  })

  it('opens the source on the line of a link, and writes nothing', async () => {
    const refs = noteRefs()
    await (await preview()).handleUri(link(notes(), 3))
    assert.equal(active(), notes().toLowerCase())
    assert.equal(vscode.window.activeTextEditor?.selection.active.line, 2)
    assert.equal(git('status', '--porcelain'), '')
    assert.equal(noteRefs(), refs)
  })

  it('opens nothing for a file outside the workspace', async () => {
    const outside = mkdtempSync(path.join(tmpdir(), 'yreview-outside-'))
    writeFileSync(path.join(outside, 'x.md'), '# x\n')
    await vscode.window.showTextDocument(vscode.Uri.file(path.join(workspace(), 'src', 'a.txt')))
    await (await preview()).handleUri(link(path.join(outside, 'x.md'), 1))
    await (await preview()).handleUri(link(path.join(workspace(), 'src', '..', '..', 'x.md'), 1))
    await (await preview()).handleUri(link(path.join(workspace(), 'src'), 1))
    assert.equal(active(), path.join(workspace(), 'src', 'a.txt').toLowerCase())
    rmSync(outside, { recursive: true, force: true })
  })

  it('marks the block of an open comment', async () => {
    const controller = vscode.comments.createCommentController('yreview-preview-test', 'Test')
    await vscode.commands.executeCommand('yreview.saveLocal', {
      thread: controller.createCommentThread(
        vscode.Uri.file(notes()),
        new vscode.Range(2, 0, 2, 0),
        [],
      ),
      text: 'Check this paragraph.',
    })
    controller.dispose()
    await render()
    await (await preview()).settled()
    assert.match(await render(), /yreview-commented/)
  })
})
