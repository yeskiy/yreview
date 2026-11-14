import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type * as vscode from 'vscode'

import { FILE_VARIABLE } from '../../src/bridge/discoveryFile'
import { BridgeHost } from '../../src/bridge/host'
import type { Log } from '../../src/log'
import { SERVER_NAME } from '../../src/session/channelConfig'
import type { BridgeWiring } from '../../src/wiring/bridge'
import { type CursorMcp, registerChatTools } from '../../src/wiring/chat'

import { until } from './window'

const log: Log = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
}

/** A stub of vscode.cursor.mcp that keeps each call. */
const cursorStub = () => {
  const calls: string[] = []
  const mcp: CursorMcp = {
    registerServer: (config) => {
      calls.push(`register ${config.name} ${config.server.env[FILE_VARIABLE] ?? 'no file'}`)
    },
    unregisterServer: (name) => {
      calls.push(`unregister ${name}`)
    },
  }
  return { calls, mcp }
}

describe('the review server in Cursor', () => {
  const home = mkdtempSync(path.join(tmpdir(), 'yreview-cursor-'))
  const state: { project: string | undefined } = { project: home }
  const host = new BridgeHost({
    channelOn: () => true,
    projectPath: () => state.project,
    home: () => home,
    onResolve: () => Promise.resolve(undefined),
    routes: new Map(),
    warn: () => undefined,
    pid: process.pid,
  })
  const wiring = (): BridgeWiring => ({
    host,
    tools: {} as BridgeWiring['tools'],
    script: path.join(home, 'channel.js'),
    launcher: () => Promise.resolve(path.join(home, 'launcher')),
  })
  const contexts: { subscriptions: vscode.Disposable[] }[] = []
  const start = (cursor: CursorMcp): void => {
    const context = { subscriptions: [] }
    contexts.push(context)
    registerChatTools(context as unknown as vscode.ExtensionContext, wiring(), log, cursor)
  }

  afterEach(async () => {
    contexts.splice(0).forEach((context) => context.subscriptions.forEach((one) => one.dispose()))
    state.project = home
    await host.stop()
  })

  after(async () => {
    await host.dispose()
    rmSync(home, { recursive: true, force: true })
  })

  it('registers again with the new launch data after the bridge restarts', async () => {
    const { calls, mcp } = cursorStub()
    start(mcp)
    assert.ok(await until(() => calls.length === 1), 'the server did not register')
    const first = await host.start()
    assert.equal(first.kind, 'available')
    const file = first.kind === 'available' ? first.path : ''
    await host.stop()
    await host.start()
    assert.ok(await until(() => calls.length === 3), calls.join('\n'))
    assert.deepEqual(calls, [
      `register ${SERVER_NAME} ${file}`,
      `unregister ${SERVER_NAME}`,
      `register ${SERVER_NAME} ${file}`,
    ])
  })

  it('registers on the next bridge start when the first start did not open the bridge', async () => {
    const { calls, mcp } = cursorStub()
    state.project = undefined
    start(mcp)
    assert.equal((await host.start()).kind, 'unavailable')
    assert.deepEqual(calls, [])
    state.project = home
    assert.equal((await host.start()).kind, 'available')
    assert.ok(await until(() => calls.length === 1), 'the server did not register on the retry')
    contexts.splice(0).forEach((context) => context.subscriptions.forEach((one) => one.dispose()))
    assert.deepEqual(calls.slice(1), [`unregister ${SERVER_NAME}`])
  })
})
