import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { setTimeout as wait } from 'node:timers/promises'

import * as vscode from 'vscode'

import type { ReviewComments } from '../../src/comments/controller'
import type { YreviewApi } from '../../src/extension'

import { focusWindow, until } from './window'

const workspace = (): string =>
  vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? assert.fail('no workspace')
const reviewComments = async (): Promise<ReviewComments> =>
  (
    await (
      vscode.extensions.getExtension<YreviewApi>('yeskiy.yreview') ?? assert.fail('no extension')
    ).activate()
  ).comments ?? assert.fail('the comment features are off')
const localNotes = (): string =>
  execFileSync('git', ['notes', '--ref', 'refs/notes/y-review/local', 'show', 'HEAD'], {
    cwd: workspace(),
    encoding: 'utf8',
  })

/** A thread that records each value set on it, so a test sees the states in their order. */
const recorded = (
  thread: vscode.CommentThread,
): { readonly thread: vscode.CommentThread; readonly states: (string | undefined)[] } => {
  const states: (string | undefined)[] = []
  return {
    states,
    thread: new Proxy(thread, {
      set: (target, key, value: unknown) => {
        if (key === 'contextValue') states.push(value as string | undefined)
        return Reflect.set(target, key, value)
      },
    }),
  }
}

describe('comment box actions', () => {
  const file = (): vscode.Uri => vscode.Uri.file(path.join(workspace(), 'src', 'a.txt'))
  const controller = vscode.comments.createCommentController('yreview-actions', 'Actions')

  before(async () => {
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(file()))
  })

  after(() => controller.dispose())

  it('shows the comment as saving at once, then as saved', async () => {
    const draft = recorded(controller.createCommentThread(file(), new vscode.Range(2, 0, 2, 0), []))
    await vscode.commands.executeCommand('yreview.saveLocal', {
      thread: draft.thread,
      text: 'Shown at once.',
    })
    assert.deepEqual(draft.states, ['yreview.saving', 'yreview.open'])
    await vscode.commands.executeCommand('yreview.resolve', draft.thread)
  })

  it('opens the box again with its text when the save fails', async () => {
    const comments = await reviewComments()
    const editor = await vscode.window.showTextDocument(
      await vscode.workspace.openTextDocument(file()),
    )
    editor.selection = new vscode.Selection(1, 0, 1, 2)
    await vscode.commands.executeCommand('yreview.addComment')
    const draft = controller.createCommentThread(file(), new vscode.Range(1, 0, 1, 0), [])
    await assert.rejects(
      Promise.resolve(
        vscode.commands.executeCommand('yreview.saveLocal', { thread: draft, text: 'Bad \uD800.' }),
      ),
      /broken character/,
    )
    assert.equal(draft.canReply, true)
    assert.deepEqual(draft.comments, [])
    assert.equal(draft.contextValue, undefined)
    assert.equal(draft.collapsibleState, vscode.CommentThreadCollapsibleState.Expanded)
    assert.ok(comments.hasPending(file(), 1), 'the selection of the box is gone')
    await vscode.commands.executeCommand('yreview.discard', { thread: draft, text: '' })
    assert.equal(comments.hasPending(file(), 1), false)
  })

  it('writes one record when the same box saves two times at once', async () => {
    const draft = controller.createCommentThread(file(), new vscode.Range(0, 0, 0, 0), [])
    const text = `Saved once ${Date.now()}.`
    await Promise.all(
      [1, 2].map(() =>
        vscode.commands.executeCommand('yreview.saveLocal', { thread: draft, text }),
      ),
    )
    assert.equal(localNotes().split(text).length - 1, 1)
    const comments = await reviewComments()
    assert.ok(comments.snapshot(file()).some((shown) => shown.thread === draft))
    await vscode.commands.executeCommand('yreview.resolve', draft)
  })

  it('saves a box whose selection ends after the end of the file after an edit', async () => {
    const comments = await reviewComments()
    const editor = await vscode.window.showTextDocument(
      await vscode.workspace.openTextDocument(file()),
    )
    editor.selection = new vscode.Selection(0, 0, 3, 0)
    await vscode.commands.executeCommand('yreview.addComment')
    await editor.edit((edit) => edit.delete(new vscode.Range(1, 0, 3, 0)))
    const draft = controller.createCommentThread(file(), new vscode.Range(0, 0, 0, 0), [])
    try {
      await vscode.commands.executeCommand('yreview.saveLocal', {
        thread: draft,
        text: 'Past the end.',
      })
      assert.equal(draft.contextValue, 'yreview.open')
      assert.equal(comments.hasPending(file(), 0), false)
    } finally {
      if (comments.hasPending(file(), 0))
        await vscode.commands.executeCommand('yreview.discard', { thread: draft, text: '' })
      else await vscode.commands.executeCommand('yreview.resolve', draft)
      await editor.edit((edit) => edit.insert(new vscode.Position(1, 0), 'two\nthree\n'))
      await editor.document.save()
    }
  })

  it('closes our box with the command that Escape runs in the box', async () => {
    const ourInputs = (): number =>
      vscode.workspace.textDocuments.filter(
        (document) => document.uri.scheme === 'comment' && document.uri.authority === 'yreview',
      ).length
    // A line with a thread opens the box through the fallback path, so this file has no thread.
    const plainFile = path.join(mkdtempSync(path.join(tmpdir(), 'yreview-esc-')), 'esc.txt')
    writeFileSync(plainFile, 'one\ntwo\n')
    const editor = await vscode.window.showTextDocument(
      await vscode.workspace.openTextDocument(vscode.Uri.file(plainFile)),
    )
    editor.selection = new vscode.Selection(0, 1, 0, 2)
    const before = ourInputs()
    // The close command acts on the focused editor, so the window must have the focus.
    await focusWindow()
    await vscode.commands.executeCommand('yreview.addComment')
    assert.ok(await until(() => ourInputs() > before), 'the comment box did not open')
    await wait(1000)
    // The text goes into the box only while the box has the focus. Undo empties the box again.
    await vscode.commands.executeCommand('type', { text: 'y' })
    assert.equal(editor.document.isDirty, false, 'the comment box did not get the focus')
    await vscode.commands.executeCommand('undo')
    await vscode.commands.executeCommand('yreview.closeBox')
    // An open box keeps the focus, so only a closed box lets the typed text reach the file.
    await vscode.commands.executeCommand('type', { text: 'x' })
    const dirty = editor.document.isDirty
    if (dirty) await vscode.commands.executeCommand('workbench.action.files.revert')
    assert.equal(dirty, true, 'the comment box did not close')
  })
})
