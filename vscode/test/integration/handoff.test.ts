import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { appendFileSync, existsSync, readdirSync } from 'node:fs'
import path from 'node:path'

import * as vscode from 'vscode'

import { handleOf } from '../../src/core/handles'
import { decodeRecord, recordId } from '../../src/core/record'
import type { YreviewApi } from '../../src/extension'
import type { ReviewTask } from '../../src/tasks/reviewTask'
import { until } from './window'

// The window helper polls every 250 ms, so 120 tries wait 30 seconds.
const THIRTY_SECONDS = 120
const workspace = (): string =>
  vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? assert.fail('no workspace')
const git = (...args: string[]): string =>
  execFileSync('git', args, { cwd: workspace(), encoding: 'utf8' }).trim()
const api = async (): Promise<YreviewApi> =>
  (
    vscode.extensions.getExtension<YreviewApi>('yeskiy.yreview') ?? assert.fail('no extension')
  ).activate()
const note = (): string => git('notes', '--ref', 'refs/notes/y-review/local', 'show', 'HEAD')

describe('handoff', () => {
  it('copies a comment, and closes it when an agent reports its handle', async function run() {
    this.timeout(90_000)
    assert.ok((await api()).handoff)
    const file = vscode.Uri.file(path.join(workspace(), 'src', 'a.txt'))
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(file))
    const controller = vscode.comments.createCommentController('yreview-handoff-test', 'Test')
    const draft = controller.createCommentThread(file, new vscode.Range(2, 0, 2, 0), [])
    await vscode.commands.executeCommand('yreview.saveLocal', {
      thread: draft,
      text: 'Hand this over.',
    })
    controller.dispose()
    const record = note()
      .split('\n')
      .map(decodeRecord)
      .find((candidate) => candidate?.description === 'Hand this over.')
    assert.ok(record)
    const id = recordId(record)
    const root = git('rev-parse', '--show-toplevel')
    const task: ReviewTask = {
      id,
      kind: 'comment',
      path: 'src/a.txt',
      startLine: 3,
      endLine: 3,
      text: 'Hand this over.',
      author: record.author,
      filePath: `${root}/src/a.txt`,
      rootPath: root,
      revision: git('rev-parse', 'HEAD'),
      state: 'local',
      folder: workspace(),
      patternRule: '',
      resolved: false,
    }
    await vscode.commands.executeCommand('yreview.copyTasks', [task])
    const prompt = await vscode.env.clipboard.readText()
    assert.ok(prompt.includes(handleOf(id)))
    assert.ok(!prompt.includes(id))
    const review = path.join(git('rev-parse', '--absolute-git-dir'), 'y-review')
    const [window] = readdirSync(review).filter((name) => name.startsWith('vscode-'))
    assert.ok(window)
    ;['AGENT.md', 'tasks.json', 'done.txt'].forEach((name) =>
      assert.ok(existsSync(path.join(review, window, name)), name),
    )
    appendFileSync(path.join(review, window, 'done.txt'), `${handleOf(id)}\n`)
    assert.ok(
      await until(() => note().includes(`"original":"${id}"`), THIRTY_SECONDS),
      'the comment was not resolved in time',
    )
    assert.equal(git('status', '--porcelain'), '')
  })
})
