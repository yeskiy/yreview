import assert from 'node:assert/strict'
import path from 'node:path'

import * as vscode from 'vscode'

import { reviewComments, textOf, workspace } from '../integration/previewKit'
import { fileOf, git } from './kit'

describe('check 3', () => {
  it('A resolved comment stays resolved', async () => {
    const file = fileOf(path.join('src', 'a.txt'))
    const text = `Resolve probe ${Date.now()}.`
    const comments = await reviewComments()
    await vscode.window.showTextDocument(file)
    await comments.addAt(file, { start: 2, end: 2 }, text, false)
    await comments.reload(file)
    const shown =
      comments.snapshot(file).find((one) => textOf(one) === text) ?? assert.fail('no thread')
    await vscode.commands.executeCommand('yreview.resolve', shown.thread)
    assert.equal(shown.thread.state, vscode.CommentThreadState.Resolved)
    await comments.reload(file)
    assert.equal(
      comments.snapshot(file).some((one) => textOf(one) === text),
      false,
      'the comment shows again after a reload',
    )
    const note = git(workspace(), 'notes', '--ref', 'refs/notes/y-review/local', 'show', 'HEAD')
    assert.ok(note.includes(text), 'the local notes hold no record of the comment')
    assert.match(note.split('\n').find((one) => one.includes(text)) ?? note, /"resolved":true/)
  })
})
