import assert from 'node:assert/strict'
import path from 'node:path'

import * as vscode from 'vscode'

import type { ReviewComments, Shown } from '../../src/comments/controller'
import type { YreviewApi } from '../../src/extension'

const workspace = (): string =>
  vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? assert.fail('no workspace')
const notes = (): vscode.Uri => vscode.Uri.file(path.join(workspace(), 'src', 'notes.md'))
const reviewComments = async (): Promise<ReviewComments> =>
  (
    await (
      vscode.extensions.getExtension<YreviewApi>('yeskiy.yreview') ?? assert.fail('no extension')
    ).activate()
  ).comments ?? assert.fail('the comment features are off')
const textOf = (shown: Shown): string =>
  (shown.thread.comments[0]?.body as vscode.MarkdownString).value
const linesOf = async (text: string): Promise<readonly number[][]> => {
  const comments = await reviewComments()
  await comments.reload(notes())
  return comments
    .snapshot(notes())
    .filter((shown) => textOf(shown) === text)
    .map((shown) => [shown.range.start.line, shown.range.end.line])
}
const idOf = async (text: string): Promise<string> => {
  const comments = await reviewComments()
  await comments.reload(notes())
  return (
    comments.snapshot(notes()).find((shown) => textOf(shown) === text)?.stored.id ??
    assert.fail('no id')
  )
}

/** Answers the next modal question with `answer`, and returns the function that restores it. */
const answerWarning = (answer: string | undefined) => {
  const original = vscode.window.showWarningMessage
  Object.defineProperty(vscode.window, 'showWarningMessage', {
    configurable: true,
    value: async () => answer,
  })
  return () => Object.defineProperty(vscode.window, 'showWarningMessage', { value: original })
}

describe('comment writes of the review preview', () => {
  afterEach(async () => {
    const comments = await reviewComments()
    await comments.reload(notes())
    const restore = answerWarning('Delete')
    try {
      await comments
        .snapshot(notes())
        .reduce<Promise<unknown>>(
          (done, shown) => done.then(() => comments.deleteId(notes(), shown.stored.id)),
          Promise.resolve(),
        )
    } finally {
      restore()
    }
    await vscode.commands.executeCommand('workbench.action.closeAllEditors')
  })

  it('saves a comment on whole lines with no editor open', async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors')
    await (await reviewComments()).addAt(notes(), { start: 2, end: 4 }, 'Whole lines.', false)
    assert.deepEqual(await linesOf('Whole lines.'), [[2, 4]])
  })

  it('saves a second comment on a line that has a saved thread', async () => {
    await vscode.window.showTextDocument(notes())
    const comments = await reviewComments()
    await comments.addAt(notes(), { start: 2, end: 2 }, 'First.', false)
    await comments.addAt(notes(), { start: 2, end: 2 }, 'Second.', false)
    assert.deepEqual(await linesOf('First.'), [[2, 2]])
    assert.deepEqual(await linesOf('Second.'), [[2, 2]])
  })

  it('refuses empty text and keeps lines past the end of the file inside it', async () => {
    const comments = await reviewComments()
    await assert.rejects(
      comments.addAt(notes(), { start: 0, end: 0 }, '  ', false),
      /Write the comment text first/,
    )
    await comments.addAt(notes(), { start: 4, end: 900 }, 'Clamped.', false)
    const [[start, end] = []] = await linesOf('Clamped.')
    const { lineCount } = await vscode.workspace.openTextDocument(notes())
    assert.equal(start, 4)
    assert.ok((end ?? Infinity) <= lineCount - 1, 'the comment ends after the file')
  })

  it('resolves a comment by its id', async () => {
    const comments = await reviewComments()
    await comments.addAt(notes(), { start: 2, end: 2 }, 'Resolve me.', false)
    const id = await idOf('Resolve me.')
    await comments.resolveId(notes(), id)
    await vscode.commands.executeCommand('workbench.action.closeAllEditors')
    assert.deepEqual(await linesOf('Resolve me.'), [])
    // The resolved thread stays drawn, and a thread on a line takes the focus of a new box there.
    const restore = answerWarning('Delete')
    try {
      assert.equal(await comments.deleteId(notes(), id), true)
    } finally {
      restore()
    }
  })

  it('deletes a comment by its id only after the question', async () => {
    const comments = await reviewComments()
    await comments.addAt(notes(), { start: 2, end: 2 }, 'Delete me.', false)
    const id = await idOf('Delete me.')
    const keep = answerWarning(undefined)
    try {
      assert.equal(await comments.deleteId(notes(), id), false)
    } finally {
      keep()
    }
    assert.deepEqual(await linesOf('Delete me.'), [[2, 2]])
    const remove = answerWarning('Delete')
    try {
      assert.equal(await comments.deleteId(notes(), id), true)
    } finally {
      remove()
    }
    assert.deepEqual(await linesOf('Delete me.'), [])
  })
})
