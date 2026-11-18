import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import * as vscode from 'vscode'

import type { YreviewApi } from '../../../src/extension'

import { until } from '../window'

const api = async (): Promise<YreviewApi> =>
  (
    vscode.extensions.getExtension<YreviewApi>('yeskiy.yreview') ?? assert.fail('no extension')
  ).activate()

const storeFile = (folder: string): string =>
  path.join(folder, '.y-review', 'notes', 'refs-notes-y-review-local', 'worktree.jsonl')
const sharedStore = (folder: string): string =>
  path.join(folder, '.y-review', 'notes', 'refs-notes-devtools-discuss')

/** The folders above the folder, nearest first. */
const ancestors = (folder: string): readonly string[] =>
  path.dirname(folder) === folder ? [] : [path.dirname(folder), ...ancestors(path.dirname(folder))]

const lines = (file: string): readonly string[] =>
  readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line !== '')

describe('comments on loose files in an empty window', () => {
  const folder = path.join(realpathSync.native(tmpdir()), `yreview-loose-${randomUUID()}`)
  const fileIn = (dir: string, name: string): vscode.Uri => vscode.Uri.file(path.join(dir, name))
  const save = async (uri: vscode.Uri, text: string, command = 'yreview.saveLocal') => {
    const controller = vscode.comments.createCommentController('yreview-loose-test', 'Test')
    const draft = controller.createCommentThread(uri, new vscode.Range(0, 0, 0, 0), [])
    try {
      await vscode.commands.executeCommand(command, { thread: draft, text })
    } finally {
      controller.dispose()
    }
  }

  before(function noStoreAbove() {
    // A store above the scratch folder would take the comments, so the test does not write there.
    if (ancestors(folder).some((dir) => existsSync(path.join(dir, '.y-review', 'notes'))))
      this.skip()
    mkdirSync(folder, { recursive: true })
    writeFileSync(path.join(folder, 'one.md'), '# One\n')
    writeFileSync(path.join(folder, 'two.md'), '# Two\n')
  })

  after(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors')
    // On Windows the file watcher of the window can hold the folder for a short time.
    rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
  })

  it('runs with no workspace folder', () => {
    assert.equal(vscode.workspace.workspaceFolders, undefined)
  })

  it('saves a comment on a loose file into a store next to the file', async () => {
    await vscode.window.showTextDocument(fileIn(folder, 'one.md'))
    await save(fileIn(folder, 'one.md'), 'Loose note.')
    assert.equal(lines(storeFile(folder)).length, 1)
    assert.match(readFileSync(storeFile(folder), 'utf8'), /"commit":"worktree","path":"one.md"/)
  })

  it('shows the comment again after a reload', async () => {
    const { comments } = await api()
    assert.ok(comments)
    await vscode.commands.executeCommand('workbench.action.closeAllEditors')
    await vscode.window.showTextDocument(fileIn(folder, 'one.md'))
    await comments.reload(fileIn(folder, 'one.md'))
    assert.ok(
      await until(() =>
        comments
          .snapshot(fileIn(folder, 'one.md'))
          .some((shown) => shown.stored.record.description === 'Loose note.'),
      ),
      'the thread did not show again',
    )
    const [shown] = comments.snapshot(fileIn(folder, 'one.md'))
    assert.equal(shown?.anchor.store, 'folder')
  })

  it('a second loose file of the folder adds a line to the same store', async () => {
    await vscode.window.showTextDocument(fileIn(folder, 'two.md'))
    await save(fileIn(folder, 'two.md'), 'Second note.')
    assert.equal(lines(storeFile(folder)).length, 2)
    assert.equal(existsSync(path.join(path.dirname(folder), '.y-review')), false)
  })

  it('a shared save on a loose file writes the local ref when shared comments come first', async () => {
    const settings = vscode.workspace.getConfiguration('yreview')
    await settings.update('newComments', 'shared', vscode.ConfigurationTarget.Global)
    try {
      writeFileSync(path.join(folder, 'four.md'), '# Four\n')
      await vscode.window.showTextDocument(fileIn(folder, 'four.md'))
      await save(fileIn(folder, 'four.md'), 'Shared first.', 'yreview.saveShared')
      assert.match(readFileSync(storeFile(folder), 'utf8'), /"path":"four.md"/)
      assert.equal(existsSync(sharedStore(folder)), false)
    } finally {
      await settings.update('newComments', undefined, vscode.ConfigurationTarget.Global)
    }
  })

  it('a save into a read-only folder fails with a message that names the folder', async function readOnly() {
    if (process.platform === 'win32') this.skip()
    const locked = path.join(folder, 'locked')
    mkdirSync(locked)
    writeFileSync(path.join(locked, 'three.md'), '# Three\n')
    chmodSync(locked, 0o555)
    try {
      // A root user writes into a read-only folder, so the case has nothing to check there.
      if (process.getuid?.() === 0) this.skip()
      await vscode.window.showTextDocument(fileIn(locked, 'three.md'))
      await assert.rejects(save(fileIn(locked, 'three.md'), 'Kept text.'), (error: unknown) =>
        String(error instanceof Error ? error.message : error).includes(locked),
      )
      assert.equal(existsSync(path.join(locked, '.y-review')), false)
    } finally {
      chmodSync(locked, 0o755)
    }
  })
})
