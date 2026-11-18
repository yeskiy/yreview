import assert from 'node:assert/strict'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { setTimeout as wait } from 'node:timers/promises'

import * as vscode from 'vscode'

import type { YreviewApi } from '../../src/extension'
import type { ReviewSessions } from '../../src/session/terminals'
import { removeDir, scratchDir } from '../fixtures/scratch'
import { until } from './window'

const windows = process.platform === 'win32'
// The window helper polls every 250 ms, so 120 tries wait 30 seconds.
const THIRTY_SECONDS = 120
const workspace = (): string =>
  vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? assert.fail('no workspace')
const api = async (): Promise<YreviewApi> =>
  (
    vscode.extensions.getExtension<YreviewApi>('yeskiy.yreview') ?? assert.fail('no extension')
  ).activate()
const config = (): vscode.WorkspaceConfiguration => vscode.workspace.getConfiguration('yreview')
const same = (one: string, two: string): boolean => {
  const real = (value: string): string => realpathSync.native(value.trim())
  return windows ? real(one).toLowerCase() === real(two).toLowerCase() : real(one) === real(two)
}
const stopAll = (sessions: ReviewSessions): void =>
  sessions.list().forEach((session) => sessions.stop(session))

/** An agent that writes its working folder, then waits `seconds`. */
const agentScript = (dir: string, seconds: number): string => {
  const file = path.join(dir, windows ? 'agent.cmd' : 'agent.sh')
  writeFileSync(
    file,
    windows
      ? `@echo off\r\ncd > "%~dp0cwd.txt"\r\nping -n ${seconds + 1} 127.0.0.1 > nul\r\n`
      : `#!/bin/sh\npwd > "$(dirname "$0")/cwd.txt"\nsleep ${seconds}\n`,
  )
  if (!windows) chmodSync(file, 0o755)
  return file
}

describe('review sessions', () => {
  const dir = scratchDir()

  after(async () => {
    await config().update('agent', undefined, vscode.ConfigurationTarget.Global)
    await config().update('agentCommands', undefined, vscode.ConfigurationTarget.Global)
    removeDir(dir)
  })

  it('runs Another agent in a named terminal in the workspace folder, and ends with it', async () => {
    const { sessions } = await api()
    try {
      await config().update(
        'agentCommands',
        { custom: agentScript(dir, 3) },
        vscode.ConfigurationTarget.Global,
      )
      await config().update('agent', 'custom', vscode.ConfigurationTarget.Global)
      await vscode.commands.executeCommand('yreview.startSession')
      const [session] = sessions.list()
      assert.equal(session?.terminal.name, 'Agent 1')
      assert.equal(sessions.registry.entries()[0]?.name, 'Agent 1')
      assert.ok(
        // The shell makes the file before it writes the line, so the wait is for the line end.
        await until(
          () =>
            existsSync(path.join(dir, 'cwd.txt')) &&
            readFileSync(path.join(dir, 'cwd.txt'), 'utf8').includes('\n'),
          THIRTY_SECONDS,
        ),
        'the agent wrote no working folder',
      )
      assert.ok(same(readFileSync(path.join(dir, 'cwd.txt'), 'utf8'), workspace()))
      assert.ok(
        await until(() => sessions.list().length === 0, THIRTY_SECONDS),
        `the session did not end, exit status ${JSON.stringify(session?.terminal.exitStatus)}`,
      )
      assert.deepEqual(sessions.registry.entries(), [])
    } finally {
      stopAll(sessions)
    }
  })

  it('a stop ends the session and frees its number', async () => {
    const { sessions } = await api()
    try {
      await config().update(
        'agentCommands',
        { custom: agentScript(dir, 60) },
        vscode.ConfigurationTarget.Global,
      )
      await vscode.commands.executeCommand('yreview.startSession')
      await vscode.commands.executeCommand('yreview.startSession')
      assert.deepEqual(
        sessions.list().map((session) => session.number),
        [1, 2],
      )
      await vscode.commands.executeCommand('yreview.stopSession', sessions.list()[0])
      assert.deepEqual(
        sessions.list().map((session) => session.number),
        [2],
      )
      await vscode.commands.executeCommand('yreview.startSession')
      assert.deepEqual(
        sessions.list().map((session) => session.number),
        [1, 2],
      )
      stopAll(sessions)
      assert.deepEqual(sessions.registry.entries(), [])
    } finally {
      stopAll(sessions)
    }
  })

  it('No agent starts nothing', async () => {
    const { sessions } = await api()
    try {
      await config().update('agent', 'none', vscode.ConfigurationTarget.Global)
      await vscode.commands.executeCommand('yreview.startSession')
      assert.equal(sessions.list().length, 0)
    } finally {
      stopAll(sessions)
    }
  })

  it('ignores a workspace value for the agent command (S8)', async () => {
    const folder = path.join(workspace(), '.vscode')
    const made = !existsSync(folder)
    const file = path.join(folder, 'settings.json')
    mkdirSync(folder, { recursive: true })
    try {
      writeFileSync(
        file,
        JSON.stringify({ 'yreview.agentCommands': { custom: 'evil' }, 'yreview.agent': 'custom' }),
      )
      await wait(1_500)
      assert.notDeepEqual(config().get('agentCommands'), { custom: 'evil' })
      assert.equal(config().inspect('agentCommands')?.workspaceValue, undefined)
    } finally {
      rmSync(made ? folder : file, { recursive: true, force: true })
    }
  })
})
