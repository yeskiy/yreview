import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

import * as vscode from 'vscode'

import type { YreviewApi } from '../../../src/extension'

const workspace = (): string =>
  vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? assert.fail('no workspace')
const git = (...args: string[]): string =>
  execFileSync('git', args, { cwd: workspace(), encoding: 'utf8' }).trim()
const api = async (): Promise<YreviewApi> =>
  (
    vscode.extensions.getExtension<YreviewApi>('yeskiy.yreview') ?? assert.fail('no extension')
  ).activate()

describe('comments in a folder outside git', () => {
  const file = (): vscode.Uri => vscode.Uri.file(path.join(workspace(), 'notes', 'one.md'))
  const store = (): string =>
    path.join(workspace(), '.y-review', 'notes', 'refs-notes-y-review-local', 'worktree.jsonl')
  const save = async (text: string): Promise<void> => {
    const controller = vscode.comments.createCommentController('yreview-folder-test', 'Test')
    const draft = controller.createCommentThread(file(), new vscode.Range(0, 0, 0, 0), [])
    await vscode.commands.executeCommand('yreview.saveLocal', { thread: draft, text })
    controller.dispose()
  }

  it('saves a local comment into the folder store, shows it again, and resolves it', async () => {
    const { comments } = await api()
    assert.ok(comments)
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(file()))
    await save('Folder note.')
    assert.match(readFileSync(store(), 'utf8'), /"commit":"worktree","path":"notes\/one.md"/)
    await comments.reload(file())
    const [shown] = comments.snapshot(file())
    assert.ok(shown)
    assert.equal(shown.anchor.store, 'folder')
    assert.equal(shown.thread.label, 'Lines 1-1')
    await vscode.commands.executeCommand('yreview.resolve', shown.thread)
    assert.match(readFileSync(store(), 'utf8'), /"resolved":true/)
  })

  it('moves the folder store into the git notes after a repository with a commit exists', async () => {
    const { service } = await api()
    assert.ok(service)
    await save('Move me.')
    git('init', '-q', '-b', 'main')
    git('config', 'user.email', 'reviewer@example.com')
    git('config', 'user.name', 'Reviewer')
    git('config', 'commit.gpgsign', 'false')
    git('add', 'notes')
    git('commit', '-q', '-m', 'init')
    assert.deepEqual(await service.folderStoreRoots(true), [])
    assert.equal(existsSync(path.join(workspace(), '.y-review')), false)
    assert.match(git('notes', '--ref', 'refs/notes/y-review/local', 'show', 'HEAD'), /Move me\./)
    assert.ok(
      readdirSync(path.join(workspace(), '.git', 'y-review')).some((name) =>
        name.startsWith('migrated-'),
      ),
    )
  })
})
