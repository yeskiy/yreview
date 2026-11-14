import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { setTimeout as wait } from 'node:timers/promises'

import * as vscode from 'vscode'

import type { ReviewComments } from '../../src/comments/controller'
import type { YreviewApi } from '../../src/extension'

const workspace = (): string =>
  vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? assert.fail('no workspace')
const git = (...args: string[]): string =>
  execFileSync('git', args, { cwd: workspace(), encoding: 'utf8' })
const reviewComments = async (): Promise<ReviewComments> =>
  (
    await (
      vscode.extensions.getExtension<YreviewApi>('yeskiy.yreview') ?? assert.fail('no extension')
    ).activate()
  ).comments ?? assert.fail('the comment features are off')

/** Waits until no git process starts for two seconds, and gives the count since `from`. */
const settledCalls = async (comments: ReviewComments, from: number): Promise<number> => {
  const before = comments.gitCalls()
  await wait(2000)
  return comments.gitCalls() === before ? before - from : settledCalls(comments, from)
}

describe('git calls of one comment action', () => {
  const file = (): vscode.Uri => vscode.Uri.file(path.join(workspace(), 'src', 'a.txt'))
  const controller = vscode.comments.createCommentController('yreview-calls', 'Calls')
  const counts: Record<string, number> = {}
  const bare = (): string => path.join(workspace(), '.git', 'calls-remote.git')
  const times: Record<string, number> = {}

  before(async () => {
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(file()))
    // The bare remote sits in the git dir of the test workspace, which the next run makes again.
    execFileSync('git', ['init', '-q', '--bare', bare()])
    git('remote', 'add', 'origin', bare())
  })

  after(async function cleanUp() {
    this.timeout(300_000)
    // eslint-disable-next-line no-console
    console.log(`Git calls and command time per action: ${JSON.stringify({ counts, times })}`)
    const comments = await reviewComments()
    await comments
      .snapshot(file())
      .flatMap((entry) => entry.thread.comments.slice(0, 1))
      .reduce<Promise<unknown>>(
        (done, comment) => done.then(() => comments.deleteComment(comment)),
        Promise.resolve(),
      )
    controller.dispose()
    git('remote', 'remove', 'origin')
  })

  const measure = async (name: string, action: () => Thenable<unknown>): Promise<void> => {
    const comments = await reviewComments()
    await settledCalls(comments, 0)
    const from = comments.gitCalls()
    const start = Date.now()
    await action()
    times[name] = Date.now() - start
    counts[name] = await settledCalls(comments, from)
  }

  it('counts the git calls of Save Local, Save Shared and Delete', async function count() {
    this.timeout(900_000)
    await measure('saveLocal', () =>
      vscode.commands.executeCommand('yreview.saveLocal', {
        thread: controller.createCommentThread(file(), new vscode.Range(0, 0, 0, 0), []),
        text: 'Counted local.',
      }),
    )
    await measure('saveShared', () =>
      vscode.commands.executeCommand('yreview.saveShared', {
        thread: controller.createCommentThread(file(), new vscode.Range(1, 0, 1, 0), []),
        text: 'Counted shared.',
      }),
    )
    const comments = await reviewComments()
    const shown = comments
      .snapshot(file())
      .find(
        (entry) =>
          (entry.thread.comments[0]?.body as vscode.MarkdownString).value === 'Counted local.',
      )
    assert.ok(shown)
    const comment = shown.thread.comments[0] ?? assert.fail('no comment')
    await measure('delete', () => comments.deleteComment(comment))
    // The first write of a session also reads the common git dir once.
    const found = JSON.stringify(counts)
    assert.ok((counts.saveLocal ?? 99) <= 9, `Save Local: ${found}`)
    assert.ok((counts.saveShared ?? 99) <= 12, `Save Shared: ${found}`)
    assert.ok((counts.delete ?? 99) <= 7, `Delete: ${found}`)
  })
})
