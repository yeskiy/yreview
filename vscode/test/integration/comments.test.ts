import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

import * as vscode from 'vscode'

import type { ReviewComments } from '../../src/comments/controller'
import type { YreviewApi } from '../../src/extension'

const workspace = (): string =>
  vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? assert.fail('no workspace')
const git = (...args: string[]): string =>
  execFileSync('git', args, { cwd: workspace(), encoding: 'utf8' })
const api = async (): Promise<YreviewApi> =>
  (
    vscode.extensions.getExtension<YreviewApi>('yeskiy.yreview') ?? assert.fail('no extension')
  ).activate()
const reviewComments = async (): Promise<ReviewComments> =>
  (await api()).comments ?? assert.fail('the comment features are off')

describe('comments in the editor', () => {
  const file = (): vscode.Uri => vscode.Uri.file(path.join(workspace(), 'src', 'a.txt'))
  const tracked = (): string => git('ls-files', '-s')

  it('saves a local comment, shows it again after a reload, and resolves it', async () => {
    const before = tracked()
    const comments = await reviewComments()
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(file()))
    const controller = vscode.comments.createCommentController('yreview-test', 'Test')
    const draft = controller.createCommentThread(file(), new vscode.Range(1, 0, 1, 0), [])
    await vscode.commands.executeCommand('yreview.saveLocal', {
      thread: draft,
      text: 'Check this line. [Run](command:workbench.action.quit) <b>bold</b>',
    })
    controller.dispose()
    assert.match(
      git('notes', '--ref', 'refs/notes/y-review/local', 'show', 'HEAD'),
      /Check this line\./,
    )

    await comments.reload(file())
    const [shown] = comments.snapshot(file())
    assert.ok(shown)
    const body = shown.thread.comments[0]?.body as vscode.MarkdownString
    assert.equal(body.value, 'Check this line. [Run](command:workbench.action.quit) <b>bold</b>')
    assert.equal(body.isTrusted, false)
    assert.equal(body.supportHtml, false)
    assert.equal(shown.thread.range?.start.line, 1)
    assert.equal(shown.thread.label, 'Lines 2-2')

    await vscode.commands.executeCommand('yreview.resolve', shown.thread)
    assert.equal(shown.thread.state, vscode.CommentThreadState.Resolved)
    assert.match(
      git('notes', '--ref', 'refs/notes/y-review/local', 'show', 'HEAD'),
      /"resolved":true/,
    )
    await comments.reload(file())
    assert.deepEqual(comments.snapshot(file()), [])

    assert.equal(git('status', '--porcelain'), '')
    assert.equal(tracked(), before)
  })

  it('registers the comment commands', async () => {
    await api()
    const all = await vscode.commands.getCommands(true)
    ;[
      'yreview.addComment',
      'yreview.saveLocal',
      'yreview.saveShared',
      'yreview.resolve',
      'yreview.delete',
    ].forEach((command) => assert.ok(all.includes(command), command))
  })
})
