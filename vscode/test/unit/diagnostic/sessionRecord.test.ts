import assert from 'node:assert/strict'
import path from 'node:path'

import {
  type SessionStart,
  failureRecord,
  recordText,
  sendRecord,
  sessionRecord,
} from '../../../src/diagnostic/sessionRecord'

const at = new Date(2026, 8, 4, 10, 11, 12)
const ownRoot = path.resolve(__dirname, '../../..')
const ready: SessionStart = {
  command: 'claude --mcp-config C:/Users/alice/.y-review/mcp/claude-vscode.json',
  directory: 'E:/work/demo-repo',
  bridgeReady: true,
  bridgeUrl: 'http://127.0.0.1:64343',
  status: 'The channel is on.',
  channelServer: {
    kind: 'found',
    path: 'C:/Users/alice/.vscode/extensions/yeskiy.yreview-1.0.0/dist/channel.js',
  },
  runtime: 'C:/Users/alice/AppData/Local/Programs/Microsoft VS Code/Code.exe',
  configFile: 'C:/Users/alice/.y-review/mcp/claude-vscode.json',
  terminalStarted: true,
  processId: 4242,
}

describe('session records', () => {
  it('a session record has no field that can hold the bridge token', () =>
    assert.deepEqual(
      sessionRecord(ready, at).facts.map(([name]) => name),
      [
        'command',
        'directory',
        'bridge',
        'status',
        'channel server',
        'node runtime',
        'config file',
        'terminal',
        'process',
      ],
    ))

  it('a session record carries the bridge address', () =>
    assert.match(recordText(sessionRecord(ready, at)), /http:\/\/127\.0\.0\.1:64343/))

  it('a session record carries the time and the process', () => {
    const text = recordText(sessionRecord(ready, at))
    assert.ok(text.startsWith('[2026-09-04 10:11:12] session start'), text)
    assert.match(text, /4242/)
  })

  it('a session record carries the reason the channel stayed out', () => {
    const text = recordText(
      sessionRecord(
        {
          ...ready,
          bridgeReady: false,
          bridgeUrl: '',
          status: 'The channel is off in the settings.',
        },
        at,
      ),
    )
    assert.match(text, /not ready/)
    assert.match(text, /off in the settings/)
  })

  it('a session record names the channel server and the runtime', () => {
    const text = recordText(sessionRecord(ready, at))
    assert.match(text, /found at /)
    assert.match(text, /channel\.js/)
    assert.match(text, /Code\.exe/)
  })

  it('a send record carries the route, the store and the readers', () => {
    const text = recordText(
      sendRecord(
        { route: 'CHANNEL', store: 'git', readers: 1, tasks: 3, batches: 1, dropped: 0 },
        at,
      ),
    )
    assert.match(text, /channel/)
    assert.match(text, /git/)
    assert.match(text, /readers/)
  })

  it('a send record carries the reason a send took the clipboard', () => {
    const text = recordText(
      sendRecord(
        { route: 'NO_SESSION', store: 'folder', readers: 0, tasks: 2, batches: 0, dropped: 0 },
        at,
      ),
    )
    assert.match(text, /no_session/)
    assert.match(text, /folder/)
  })

  it('a send record holds counts and states only', () =>
    assert.deepEqual(
      sendRecord(
        { route: 'CHANNEL', store: 'git', readers: 1, tasks: 3, batches: 1, dropped: 0 },
        at,
      ).facts.map(([name]) => name),
      ['route', 'store', 'readers', 'tasks', 'batches', 'dropped', 'problem'],
    ))

  it('a failure record names the work, the type and the frame of the extension', () => {
    const text = recordText(
      failureRecord('write the task files', new Error('the disk is full'), ownRoot, at),
    )
    assert.match(text, /write the task files/)
    assert.match(text, /Error/)
    assert.match(text, /the disk is full/)
    assert.match(text, /sessionRecord\.test\.ts/)
  })

  it('a failure record names no frame when no frame is under the extension', () =>
    assert.match(
      recordText(failureRecord('read', new Error('x'), path.join(ownRoot, 'no-such-folder'), at)),
      /origin {9}unknown/,
    ))
})
