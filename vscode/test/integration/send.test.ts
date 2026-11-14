import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { type ClientRequest, get } from 'node:http'
import path from 'node:path'

import * as vscode from 'vscode'

import { TOKEN_HEADER } from '../../src/bridge/token'
import { handleOf } from '../../src/core/handles'
import type { YreviewApi } from '../../src/extension'
import { CHANNEL } from '../../src/session/sessionReach'
import { SESSION_HEADER, newSessionKey } from '../../src/session/sessionKey'
import type { ReviewTask } from '../../src/tasks/reviewTask'
import { until } from './window'

const workspace = (): string =>
  vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? assert.fail('no workspace')
const git = (...args: string[]): string =>
  execFileSync('git', args, { cwd: workspace(), encoding: 'utf8' }).trim()
const api = async (): Promise<YreviewApi> =>
  (
    vscode.extensions.getExtension<YreviewApi>('yeskiy.yreview') ?? assert.fail('no extension')
  ).activate()
const config = (): vscode.WorkspaceConfiguration => vscode.workspace.getConfiguration('yreview')
const cursorFile = (): string => path.join(workspace(), '.cursor', 'mcp.json')

/** Every file under a folder, so a test sees a new file. */
const filesUnder = (folder: string): readonly string[] =>
  existsSync(folder)
    ? readdirSync(folder, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => path.join(entry.parentPath, entry.name))
        .sort()
    : []

const taskOf = (text: string, line: number): ReviewTask => {
  const root = git('rev-parse', '--show-toplevel')
  return {
    id: createHash('sha1').update(text).digest('hex'),
    kind: 'comment',
    path: 'src/a.txt',
    startLine: line,
    endLine: line,
    text,
    filePath: `${root}/src/a.txt`,
    rootPath: root,
    revision: git('rev-parse', 'HEAD'),
    state: 'local',
    folder: workspace(),
    patternRule: '',
    resolved: false,
  }
}

describe('the send command and the Add commands', () => {
  const shown: string[] = []
  const answer: { value?: string } = {}
  const original = {
    showWarningMessage: vscode.window.showWarningMessage,
    showInformationMessage: vscode.window.showInformationMessage,
  }

  before(() => {
    Object.assign(vscode.window, {
      showWarningMessage: (text: string) => {
        shown.push(text)
        return Promise.resolve(answer.value)
      },
      showInformationMessage: (text: string) => {
        shown.push(text)
        return Promise.resolve(undefined)
      },
    })
  })

  beforeEach(() => {
    shown.length = 0
    answer.value = undefined
  })

  after(() => {
    Object.assign(vscode.window, original)
    rmSync(path.join(workspace(), '.cursor'), { recursive: true, force: true })
  })

  it('a send with no session copies the prompt and names the folder', async function run() {
    this.timeout(60_000)
    await api()
    const task = taskOf('Send with no session.', 1)
    await vscode.commands.executeCommand('yreview.sendTasks', [task])
    const notice = shown.find((text) => text.includes('session reads this project'))
    assert.ok(notice, shown.join(' | '))
    assert.match(notice, /^No Claude Code session reads this project, so Yreview wrote 1 task to /)
    const prompt = await vscode.env.clipboard.readText()
    assert.ok(prompt.startsWith('Read '), prompt)
    assert.ok(prompt.includes(handleOf(task.id)))
  })

  it('a send with the channel off copies the prompt', async function run() {
    this.timeout(60_000)
    await api()
    await config().update('channel', false, vscode.ConfigurationTarget.Global)
    try {
      await vscode.commands.executeCommand('yreview.sendTasks', [taskOf('Channel off.', 2)])
      assert.ok(
        shown.some((text) => text.startsWith('The review channel is off in the settings, so')),
        shown.join(' | '),
      )
      assert.ok((await vscode.env.clipboard.readText()).startsWith('Read '))
    } finally {
      await config().update('channel', undefined, vscode.ConfigurationTarget.Global)
    }
  })

  it('a send reaches a stream of a registered channel session', async function run() {
    this.timeout(60_000)
    const { bridge, sessions } = await api()
    const lookup = (await bridge?.start()) ?? assert.fail('no bridge')
    if (lookup.kind !== 'available') return assert.fail(lookup.kind)
    const entry = JSON.parse(readFileSync(lookup.path, 'utf8')) as { url: string; token: string }
    const key = newSessionKey()
    const received: string[] = []
    const request: ClientRequest = get(`${entry.url}/events`, {
      headers: { [TOKEN_HEADER]: entry.token, [SESSION_HEADER]: key },
    })
    request.on('response', (response) => {
      response.setEncoding('utf8')
      response.on('data', (chunk: string) => received.push(chunk))
    })
    request.on('error', () => undefined)
    try {
      sessions.registry.add(key, 'Stream test', CHANNEL)
      assert.ok(await until(() => bridge?.openKeys().includes(key) === true), 'no open stream')
      const task = taskOf('Send through the channel.', 3)
      await vscode.commands.executeCommand('yreview.sendTasks', [task])
      assert.ok(shown.includes('Yreview sent 1 task to Stream test.'), shown.join(' | '))
      assert.ok(
        await until(() =>
          received
            .join('')
            .split('\n')
            .some((line) => line.startsWith('data:') && line.includes(handleOf(task.id))),
        ),
        'the stream got no data line with the handle',
      )
      return undefined
    } finally {
      sessions.registry.remove(key)
      request.destroy()
    }
  })

  it('a send with no task writes nothing', async function run() {
    this.timeout(60_000)
    await api()
    const review = path.join(git('rev-parse', '--absolute-git-dir'), 'y-review')
    const before = filesUnder(review)
    await vscode.commands.executeCommand('yreview.sendTasks', [])
    assert.ok(shown.includes('Check or select the review tasks to send first.'), shown.join(' | '))
    assert.deepEqual(filesUnder(review), before)
  })

  it('the Cursor Add writes nothing without the press', async function run() {
    this.timeout(60_000)
    await api()
    await vscode.commands.executeCommand('yreview.addMcpCursor')
    assert.ok(
      shown.some((text) => text.includes('.cursor/mcp.json')),
      shown.join(' | '),
    )
    assert.equal(existsSync(cursorFile()), false)
  })

  it('the Cursor Add keeps another server', async function run() {
    this.timeout(60_000)
    await api()
    mkdirSync(path.dirname(cursorFile()), { recursive: true })
    writeFileSync(
      cursorFile(),
      JSON.stringify({ mcpServers: { other: { command: 'other-server', args: [] } } }),
    )
    answer.value = 'Add'
    await vscode.commands.executeCommand('yreview.addMcpCursor')
    const servers = (
      JSON.parse(readFileSync(cursorFile(), 'utf8')) as { mcpServers: Record<string, unknown> }
    ).mcpServers
    assert.deepEqual(Object.keys(servers).sort(), ['other', 'y-review'])
  })
})
