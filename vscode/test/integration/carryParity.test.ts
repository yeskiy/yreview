import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import path from 'node:path'

import * as vscode from 'vscode'

import type { YreviewApi } from '../../src/extension'

import { until } from './window'

interface Seen {
  readonly id: string
  readonly start: number
  readonly end: number
}

const workspace = (): string =>
  vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? assert.fail('no workspace')
const git = (...args: string[]): string =>
  execFileSync('git', args, { cwd: workspace(), encoding: 'utf8' })
const api = async (): Promise<YreviewApi> =>
  (
    vscode.extensions.getExtension<YreviewApi>('yeskiy.yreview') ?? assert.fail('no extension')
  ).activate()
const head = (): string => git('rev-parse', 'HEAD').trim()
const sorted = (seen: readonly Seen[]): readonly Seen[] =>
  [...seen].sort((a, b) => a.id.localeCompare(b.id))
const startsOf = (seen: readonly Seen[]): readonly number[] =>
  seen.map((each) => each.start).sort((a, b) => a - b)
const tenLines = (changed: string): string =>
  ['one', 'two', 'three', 'four', changed, 'six', 'seven', 'eight', 'nine', 'ten']
    .map((text) => `${text}\n`)
    .join('')

describe('the editor and the task views show the same comments', function parity() {
  this.timeout(180_000)

  const NAME = 'src/sample.ts'
  const file = (): vscode.Uri => vscode.Uri.file(path.join(workspace(), NAME))
  const controller = vscode.comments.createCommentController('yreview-parity', 'Parity')

  const editorSeen = (yreview: YreviewApi): readonly Seen[] =>
    sorted(
      (yreview.comments?.snapshot(file()) ?? []).map((shown) => ({
        id: shown.stored.id,
        start: shown.range.start.line + 1,
        end: shown.range.end.line + 1,
      })),
    )

  const viewSeen = async (yreview: YreviewApi): Promise<readonly Seen[]> => {
    await yreview.tasks?.model.refresh()
    return sorted(
      (yreview.tasks?.model.snapshot().repositories ?? [])
        .flatMap((repo) => repo.tasks)
        .filter((task) => task.kind === 'comment' && !task.resolved && task.path === NAME)
        .filter(
          (task) =>
            task.carry === undefined ||
            task.carry.kind === 'same' ||
            task.carry.kind === 'outdated',
        )
        .map((task) => ({ id: task.id, start: task.startLine, end: task.endLine })),
    )
  }

  const agree = async (count: number): Promise<readonly Seen[]> => {
    const yreview = await api()
    await yreview.comments?.reload(file())
    assert.ok(await until(() => editorSeen(yreview).length === count, 80), 'the editor count')
    const shown = editorSeen(yreview)
    assert.deepEqual(shown, await viewSeen(yreview))
    return shown
  }

  /** Waits until the open document shows the text of the file on disk. A checkout can write CRLF. */
  const shows = async (text: string): Promise<void> => {
    const document = await vscode.workspace.openTextDocument(file())
    assert.ok(
      await until(() => document.getText().replaceAll('\r', '') === text),
      'the document did not reload',
    )
  }

  const saveComment = (line: number, text: string): Thenable<unknown> =>
    vscode.commands.executeCommand('yreview.saveLocal', {
      thread: controller.createCommentThread(file(), new vscode.Range(line, 0, line, 0), []),
      text,
    })

  after(() => controller.dispose())

  it('agrees after a new commit, a checkout and an edit above the comment', async () => {
    const start = head()
    const branch = git('rev-parse', '--abbrev-ref', 'HEAD').trim()
    const first = tenLines('five')
    writeFileSync(file().fsPath, first)
    git('add', NAME)
    git('commit', '-q', '-m', 'add sample')
    const commitA = head()
    try {
      await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(file()))
      await shows(first)
      await saveComment(1, 'On line 2 of A.')
      await saveComment(7, 'On line 8 of A.')

      const second = tenLines('FIVE')
      writeFileSync(file().fsPath, second)
      await shows(second)
      git('commit', '-q', '-am', 'change line 5')
      await saveComment(2, 'On line 3 of B.')
      await saveComment(4, 'On line 5 of B.')
      const atB = await agree(4)
      assert.deepEqual(startsOf(atB), [2, 3, 5, 8])

      writeFileSync(path.join(workspace(), 'src', 'other.txt'), 'other\n')
      git('add', 'src/other.txt')
      git('commit', '-q', '-m', 'add other')
      assert.deepEqual(await agree(4), atB)

      git('checkout', '-q', '-b', 'side', commitA)
      await shows(first)
      assert.deepEqual(startsOf(await agree(4)), [2, 3, 5, 8])

      const document = await vscode.workspace.openTextDocument(file())
      const edit = new vscode.WorkspaceEdit()
      edit.insert(file(), new vscode.Position(0, 0), 'top one\ntop two\n')
      assert.ok(await vscode.workspace.applyEdit(edit), 'the edit did not apply')
      assert.ok(await document.save(), 'the document did not save')
      git('commit', '-q', '-am', 'add two lines at the top')
      assert.deepEqual(startsOf(await agree(4)), [4, 5, 7, 10])
    } finally {
      const document = await vscode.workspace.openTextDocument(file())
      if (document.isDirty) {
        await vscode.window.showTextDocument(document)
        await vscode.commands.executeCommand('workbench.action.files.revert')
      }
      await vscode.commands.executeCommand('workbench.action.closeAllEditors')
      git('checkout', '-q', '-f', branch)
      if (git('branch', '--list', 'side').trim() !== '') git('branch', '-q', '-D', 'side')
      const commits = git('rev-list', `${start}..HEAD`)
        .split('\n')
        .filter((line) => line !== '')
      git('reset', '-q', '--hard', start)
      git('notes', '--ref', 'refs/notes/y-review/local', 'remove', '--ignore-missing', ...commits)
      const yreview = await api()
      await yreview.comments?.reload(file())
      await yreview.tasks?.model.refresh()
    }
  })
})
