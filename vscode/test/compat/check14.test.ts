import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import * as vscode from 'vscode'

import { api } from '../integration/previewKit'
import { until } from '../integration/window'

/** The folders above the folder, nearest first. */
const ancestors = (folder: string): readonly string[] =>
  path.dirname(folder) === folder ? [] : [path.dirname(folder), ...ancestors(path.dirname(folder))]

describe('check 14', () => {
  const folder = path.join(realpathSync.native(tmpdir()), `yreview-compat-loose-${randomUUID()}`)
  const file = vscode.Uri.file(path.join(folder, 'loose.md'))
  const store = path.join(
    folder,
    '.y-review',
    'notes',
    'refs-notes-y-review-local',
    'worktree.jsonl',
  )

  after(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors')
    rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
  })

  it('A comment on a loose file in an empty window', async () => {
    assert.equal(vscode.workspace.workspaceFolders, undefined, 'the window has a folder')
    const above = ancestors(folder).find((dir) => existsSync(path.join(dir, '.y-review', 'notes')))
    assert.equal(above, undefined, `a store above the temp folder takes the comment: ${above}`)
    mkdirSync(folder, { recursive: true })
    writeFileSync(file.fsPath, '# Loose\n\nOne line.\n')
    const text = `Loose probe ${Date.now()}.`
    await vscode.window.showTextDocument(file, { preview: false })
    const controller = vscode.comments.createCommentController('yreview-compat-loose', 'Check')
    try {
      const draft = controller.createCommentThread(file, new vscode.Range(2, 0, 2, 0), [])
      await vscode.commands.executeCommand('yreview.saveLocal', { thread: draft, text })
    } finally {
      controller.dispose()
    }
    assert.ok(existsSync(store), 'no store next to the loose file')
    const lines = readFileSync(store, 'utf8')
      .split('\n')
      .filter((line) => line !== '')
    assert.equal(lines.length, 1, `the store holds ${lines.length} lines`)
    assert.ok(lines[0]?.includes(text), 'the store line holds no comment text')
    assert.match(lines[0] ?? '', /"commit":"worktree","path":"loose.md"/u)
    const { tasks } = await api()
    assert.ok(tasks, 'the task views are off')
    const project = tasks.view('project')
    const branches = () =>
      project.topRows().filter((row) => row.kind === 'folder' && row.folder.kind === 'outside')
    await tasks.model.refresh()
    assert.ok(
      await until(() => branches().length === 1),
      `the Project view shows ${branches().length} branches`,
    )
  })
})
