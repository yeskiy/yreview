import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  appendFileSync,
  chmodSync,
  existsSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'

import * as vscode from 'vscode'

import { handleOf } from '../../src/core/handles'
import { decodeRecord, recordId } from '../../src/core/record'
import type { YreviewApi } from '../../src/extension'
import type { ReviewTask } from '../../src/tasks/reviewTask'
import { removeDir, scratchDir } from '../fixtures/scratch'
import { until } from './window'

const windows = process.platform === 'win32'
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
const config = (): vscode.WorkspaceConfiguration => vscode.workspace.getConfiguration('yreview')
const note = (): string => git('notes', '--ref', 'refs/notes/y-review/local', 'show', 'HEAD')

/** Every file of the working tree outside `.git`, with a hash of its content. */
const filesOf = (dir: string): readonly string[] =>
  readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.name !== '.git')
    .flatMap((entry) =>
      entry.isDirectory()
        ? filesOf(path.join(dir, entry.name))
        : [
            `${path.relative(workspace(), path.join(dir, entry.name))} ${createHash('sha1')
              .update(readFileSync(path.join(dir, entry.name)))
              .digest('hex')}`,
          ],
    )
    .sort()

/** An agent that waits `seconds` and writes nothing. */
const agentScript = (dir: string, seconds: number): string => {
  const file = path.join(dir, windows ? 'agent.cmd' : 'agent.sh')
  writeFileSync(
    file,
    windows
      ? `@echo off\r\nping -n ${seconds + 1} 127.0.0.1 > nul\r\n`
      : `#!/bin/sh\nsleep ${seconds}\n`,
  )
  if (!windows) chmodSync(file, 0o755)
  return file
}

describe('no silent write (S1)', () => {
  const dir = scratchDir()

  after(async () => {
    await config().update('agent', undefined, vscode.ConfigurationTarget.Global)
    await config().update('agentCommands', undefined, vscode.ConfigurationTarget.Global)
    removeDir(dir)
  })

  it('a base session leaves the working tree clean', async function run() {
    this.timeout(120_000)
    const before = filesOf(workspace())
    const { sessions } = await api()
    await config().update(
      'agentCommands',
      { custom: agentScript(dir, 3) },
      vscode.ConfigurationTarget.Global,
    )
    await config().update('agent', 'custom', vscode.ConfigurationTarget.Global)
    await vscode.commands.executeCommand('yreview.startSession')
    const file = vscode.Uri.file(path.join(workspace(), 'src', 'a.txt'))
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(file))
    const controller = vscode.comments.createCommentController('yreview-s1-test', 'Test')
    const draft = controller.createCommentThread(file, new vscode.Range(1, 0, 1, 0), [])
    await vscode.commands.executeCommand('yreview.saveLocal', { thread: draft, text: 'Check S1.' })
    controller.dispose()
    const record = note()
      .split('\n')
      .map(decodeRecord)
      .find((candidate) => candidate?.description === 'Check S1.')
    assert.ok(record)
    const id = recordId(record)
    const root = git('rev-parse', '--show-toplevel')
    const task: ReviewTask = {
      id,
      kind: 'comment',
      path: 'src/a.txt',
      startLine: 2,
      endLine: 2,
      text: 'Check S1.',
      filePath: `${root}/src/a.txt`,
      rootPath: root,
      revision: git('rev-parse', 'HEAD'),
      state: 'local',
      folder: workspace(),
      patternRule: '',
      resolved: false,
    }
    await vscode.commands.executeCommand('yreview.copyTasks', [task])
    const review = path.join(git('rev-parse', '--absolute-git-dir'), 'y-review')
    const [window] = readdirSync(review).filter((name) => name.startsWith('vscode-'))
    assert.ok(window)
    appendFileSync(path.join(review, window, 'done.txt'), `${handleOf(id)}\n`)
    assert.ok(
      await until(() => note().includes(`"original":"${id}"`), THIRTY_SECONDS),
      'the comment was not resolved in time',
    )
    assert.ok(
      await until(() => sessions.list().length === 0, THIRTY_SECONDS),
      'the session did not end',
    )
    assert.ok(!existsSync(path.join(workspace(), '.y-review')))
    assert.equal(git('status', '--porcelain', '--ignored', '--untracked-files=all'), '')
    assert.deepEqual(filesOf(workspace()), before)
  })
})
