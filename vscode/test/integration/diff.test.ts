import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import path from 'node:path'

import * as vscode from 'vscode'

import type { YreviewApi } from '../../src/extension'

const workspace = (): string =>
  vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? assert.fail('no workspace')
const git = (...args: string[]): string =>
  execFileSync('git', args, { cwd: workspace(), encoding: 'utf8' }).trim()
const api = async (): Promise<YreviewApi> =>
  (
    vscode.extensions.getExtension<YreviewApi>('yeskiy.yreview') ?? assert.fail('no extension')
  ).activate()

interface GitApi {
  readonly repositories: readonly unknown[]
}

/** The built-in git extension serves the `git:` documents after it found the repository. */
const gitReady = async (): Promise<void> => {
  const extension =
    vscode.extensions.getExtension<{ getAPI(version: 1): GitApi }>('vscode.git') ??
    assert.fail('no git extension')
  const gitApi = (await extension.activate()).getAPI(1)
  const wait = async (left: number): Promise<void> => {
    if (gitApi.repositories.length > 0) return undefined
    if (left === 0) return assert.fail('the git extension found no repository')
    await new Promise((resolve) => {
      setTimeout(resolve, 250)
    })
    return wait(left - 1)
  }
  await wait(120)
}

describe('comments on a diff side', () => {
  const file = (): vscode.Uri => vscode.Uri.file(path.join(workspace(), 'src', 'a.txt'))
  const side = (ref: string): vscode.Uri =>
    file().with({ scheme: 'git', query: JSON.stringify({ path: file().fsPath, ref }) })
  // The comment sits on HEAD, so the other test files would see it on the working tree file.
  after(async () => {
    git('checkout', '--', 'src/a.txt')
    const { comments } = await api()
    await (comments?.snapshot(side('~')) ?? [])
      .flatMap((entry) => entry.thread.comments.slice(0, 1))
      .reduce<Promise<unknown>>(
        (done, comment) => done.then(() => comments?.deleteComment(comment)),
        Promise.resolve(),
      )
    await vscode.commands.executeCommand('workbench.action.closeAllEditors')
  })

  it('saves a comment on the left side of a working tree diff under HEAD', async () => {
    await gitReady()
    const { comments } = await api()
    assert.ok(comments)
    const head = git('rev-parse', 'HEAD')
    writeFileSync(file().fsPath, 'one\nTWO\nthree\n')
    await vscode.commands.executeCommand('vscode.diff', side('~'), file(), 'a.txt (Working Tree)')
    assert.equal(
      (await vscode.workspace.openTextDocument(side('~'))).getText(),
      'one\ntwo\nthree\n',
    )
    const controller = vscode.comments.createCommentController('yreview-diff-test', 'Test')
    const draft = controller.createCommentThread(side('~'), new vscode.Range(1, 0, 1, 0), [])
    await vscode.commands.executeCommand('yreview.saveLocal', { thread: draft, text: 'Left side.' })
    controller.dispose()
    const note = git('notes', '--ref', 'refs/notes/y-review/local', 'show', head)
    assert.match(note, /"description":"Left side\."/)
    assert.ok(note.includes(`"commit":"${head}","path":"src/a.txt"`), note)
    await comments.reload(side('~'))
    const shown = comments
      .snapshot(side('~'))
      .find((entry) => entry.stored.record.description === 'Left side.')
    assert.ok(shown)
    assert.equal(shown.thread.label, `Lines 2-2 @${head.slice(0, 7)}`)
    assert.equal((shown.thread.comments[0]?.body as vscode.MarkdownString).isTrusted, false)
  })

  it('shows the same comment on a side that names the commit', async () => {
    const { comments } = await api()
    assert.ok(comments)
    const head = git('rev-parse', 'HEAD')
    await comments.reload(side(head))
    assert.ok(
      comments
        .snapshot(side(head))
        .some((entry) => entry.stored.record.description === 'Left side.'),
    )
  })

  it('gives a merge stage no anchor', async () => {
    const { service } = await api()
    assert.ok(service)
    assert.equal((await service.anchorOfRevision(file().fsPath, '~1')).kind, 'noPlace')
  })

  it('changes no file of the working tree', () => {
    git('checkout', '--', 'src/a.txt')
    assert.equal(git('status', '--porcelain'), '')
  })
})
