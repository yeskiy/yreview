import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { setTimeout as wait } from 'node:timers/promises'

import * as vscode from 'vscode'

import type { ReviewComments } from '../../src/comments/controller'
import type { YreviewApi } from '../../src/extension'

import { until } from './window'

const NAME = 'src/glyphs.ts'
const SOURCE = [
  'export function add(a: number, b: number): number {',
  '  return a + b',
  '}',
  '',
  'export function scale(value: number, factor: number): number {',
  '  return value * factor',
  '}',
  '',
].join('\n')
const REF = 'refs/notes/y-review/local'

const workspace = (): string =>
  vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? assert.fail('no workspace')
const git = (...args: string[]): string =>
  execFileSync('git', args, { cwd: workspace(), encoding: 'utf8' })
const file = (): vscode.Uri => vscode.Uri.file(path.join(workspace(), NAME))
const reviewComments = async (): Promise<ReviewComments> =>
  (
    await (
      vscode.extensions.getExtension<YreviewApi>('yeskiy.yreview') ?? assert.fail('no extension')
    ).activate()
  ).comments ?? assert.fail('the comment features are off')
const head = (): string => git('rev-parse', 'HEAD').trim()
const record = (description: string, commit: string, range: object, text?: string): string =>
  JSON.stringify({
    timestamp: '1794705320',
    author: 'reviewer@example.com',
    description,
    location: { commit, path: NAME, range, ...(text === undefined ? {} : { text }) },
  })
const addNotes = (commit: string, records: readonly string[]): string =>
  git('notes', '--ref', REF, 'add', '-f', ...records.flatMap((each) => ['-m', each]), commit)

/** The thread line, the first and last line of each shown comment, and the thread label. */
const linesOf = (comments: ReviewComments) =>
  comments
    .snapshot(file())
    .map((shown) => ({
      thread: shown.thread.range?.start.line,
      start: shown.range.start.line,
      end: shown.range.end.line,
      label: shown.thread.label,
    }))
    .sort((one, two) => one.start - two.start || one.end - two.end)

/** The native add toggles the threads with a glyph on the line, and opens a focused box on a free line. */
const glyphOn = async (line: number): Promise<boolean> => {
  await vscode.window.showTextDocument(file(), {
    viewColumn: vscode.ViewColumn.One,
    preview: false,
  })
  await vscode.commands.executeCommand('workbench.action.addComment', {
    range: { startLineNumber: line + 1, endLineNumber: line + 1, endColumn: 1 },
  })
  return !(await until(() => vscode.window.activeTextEditor?.document.uri.scheme === 'comment', 12))
}

describe('the threads of the editor match the open comments', function threads() {
  this.timeout(180_000)

  const start = head()

  before(async () => {
    writeFileSync(file().fsPath, SOURCE)
    git('add', NAME)
    git('commit', '-q', '-m', 'add glyphs')
    const first = head()
    addNotes(first, [
      record('test', first, { startLine: 5, startColumn: 6, endLine: 5, endColumn: 23 }),
      record('something something', first, { startLine: 5, endLine: 8 }),
    ])
    writeFileSync(path.join(workspace(), 'src', 'glyphs-other.txt'), 'other\n')
    git('add', 'src/glyphs-other.txt')
    git('commit', '-q', '-m', 'add other')
    const second = head()
    addNotes(second, [
      record("Here's a new one!", second, { startLine: 4, endLine: 8 }),
      record(
        'hey!',
        second,
        { startLine: 1, endLine: 3 },
        'export function add(a: number, b: number): number {\n  return a + b\n}',
      ),
    ])
    await vscode.window.showTextDocument(file(), { preview: false })
    const comments = await reviewComments()
    await comments.reload(file())
    assert.ok(await until(() => comments.snapshot(file()).length === 4), 'the editor count')
  })

  after(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors')
    const commits = git('rev-list', `${start}..HEAD`)
      .split('\n')
      .filter((line) => line !== '')
    git('reset', '-q', '--hard', start)
    git('notes', '--ref', REF, 'remove', '--ignore-missing', ...commits)
    await (await reviewComments()).reload(file())
  })

  it('puts each thread on the first line of its comment', async () => {
    assert.deepEqual(linesOf(await reviewComments()), [
      { thread: 0, start: 0, end: 2, label: 'Lines 1-3' },
      { thread: 3, start: 3, end: 7, label: 'Lines 4-8' },
      { thread: 4, start: 4, end: 4, label: 'Lines 5:6-5:23' },
      { thread: 4, start: 4, end: 7, label: 'Lines 5-8' },
    ])
    await wait(1000)
    assert.ok(await glyphOn(0), 'no glyph on line 1')
    assert.ok(await glyphOn(3), 'no glyph on line 4')
    assert.ok(await glyphOn(4), 'no glyph on line 5')
  })

  it('puts the glyphs back on their lines after an edit moves them and the file reloads', async () => {
    const document = await vscode.workspace.openTextDocument(file())
    // A file that is first empty and then full again moves each glyph to line 1.
    const cleared = new vscode.WorkspaceEdit()
    cleared.delete(file(), document.validateRange(new vscode.Range(0, 0, 99, 0)))
    assert.ok(await vscode.workspace.applyEdit(cleared), 'the delete did not apply')
    await wait(500)
    const filled = new vscode.WorkspaceEdit()
    filled.insert(file(), new vscode.Position(0, 0), SOURCE)
    assert.ok(await vscode.workspace.applyEdit(filled), 'the insert did not apply')
    assert.ok(await document.save(), 'the document did not save')
    const comments = await reviewComments()
    await comments.reload(file())
    await wait(1000)
    assert.equal(linesOf(comments).length, 4)
    assert.ok(await glyphOn(3), 'no glyph on line 4 after the reload')
    assert.ok(await glyphOn(4), 'no glyph on line 5 after the reload')
  })
})
