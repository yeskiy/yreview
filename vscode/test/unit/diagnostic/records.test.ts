import assert from 'node:assert/strict'

import { BridgeServer } from '../../../src/bridge/server'
import { redactText } from '../../../src/core/redact'
import { sendOf, startOf } from '../../../src/diagnostic/records'
import { SessionLog } from '../../../src/diagnostic/sessionLog'
import { NONE, recordText, sendRecord, sessionRecord } from '../../../src/diagnostic/sessionRecord'
import { type Places, redactingLog } from '../../../src/log'
import { bridgeExtras } from '../../../src/session/bridgePlan'
import { agentOf } from '../../../src/session/catalog'
import { channelLaunch } from '../../../src/session/channelConfig'
import { LocalServer } from '../../../src/session/localServer'
import { NO_EXTRAS, planSession } from '../../../src/session/sessionPlan'
import { NO_REACH } from '../../../src/session/sessionReach'

const HOME = '/home/probe-user'
const PROJECT = '/work/probe-project'
const PASSWORD = 'probe-password-Q7'
const COMMENT = 'probe comment text of a review task'
const REMOTE = 'git@github.com:probe-owner/probe-repo.git'
const MAIL = 'probe.user@example.com'
const places: Places = { homes: [HOME], projects: [PROJECT], repositories: [] }

const plan = planSession({
  projectPath: '/work/demo',
  agent: agentOf('claude'),
  command: 'claude',
  extras: { args: ['--mcp-config', 'x.json'], env: {}, reach: NO_REACH },
  windows: false,
  shell: '/bin/sh',
})

/** Every line that leaves through the log and the report, for one record. */
const exits = (entry: Parameters<ReturnType<typeof redactingLog>['record']>[0]): string => {
  const lines: string[] = []
  const ring = new SessionLog()
  const sink = {
    debug: (m: string) => lines.push(m),
    info: (m: string) => lines.push(m),
    warn: (m: string) => lines.push(m),
    error: (m: string) => lines.push(m),
  }
  redactingLog(sink, () => places, { ring }).record(entry)
  return [
    ...lines,
    ...ring.recent().map((kept) => redactText(recordText(kept), [HOME], [PROJECT], [])),
  ].join('\n')
}

describe('records of sessions and sends', () => {
  it('maps a plan and the bridge facts to the start of a session', async () => {
    const start = await startOf(
      plan,
      { bridgeReady: true, bridgeUrl: 'http://127.0.0.1:1', configFile: 'x.json' },
      { agentCommand: 'default', terminalStarted: true, processId: 7 },
    )
    assert.equal(start.program, 'sh')
    assert.equal(start.arguments, plan.shellArgs.length)
    assert.equal(start.agentCommand, 'default')
    assert.equal(start.directory, plan.workingDirectory)
    assert.equal(start.status, plan.status)
    assert.equal(start.bridgeUrl, 'http://127.0.0.1:1')
    assert.equal(start.configFile, 'x.json')
    assert.equal(start.runtime, process.version)
    assert.equal(start.processId, 7)
  })

  it('a start with no preparer extras has no bridge', async () => {
    const start = await startOf(plan, await NO_EXTRAS(agentOf('claude'), 'k'), {
      agentCommand: 'default',
      terminalStarted: false,
    })
    assert.equal(start.bridgeReady, false)
    assert.equal(start.bridgeUrl, NONE)
    assert.equal(start.channelServer, undefined)
    assert.equal(start.terminalStarted, false)
  })

  it('maps the channel script of the extras to the channel server state', async () =>
    assert.deepEqual(
      (
        await startOf(
          plan,
          {
            bridgeReady: true,
            bridgeUrl: 'http://127.0.0.1:1',
            channelScript: '/ext/dist/channel.js',
          },
          { agentCommand: 'default', terminalStarted: true },
        )
      ).channelServer,
      { kind: 'missing', path: 'dist/channel.js' },
    ))

  it('a channel script that exists is found', async () =>
    assert.equal(
      (
        await startOf(
          plan,
          { channelScript: __filename },
          { agentCommand: 'default', terminalStarted: true },
        )
      ).channelServer?.kind,
      'found',
    ))

  it('maps a send report to the facts of a send', () =>
    assert.deepEqual(
      sendOf({ tasks: 3, batches: 1, streams: 1, route: 'channel', dropped: 0 }, 'git', 1),
      {
        route: 'channel',
        store: 'git',
        readers: 1,
        tasks: 3,
        batches: 1,
        dropped: 0,
        problem: undefined,
      },
    ))

  it('a send with no route and a drop reason states both', () =>
    assert.deepEqual(
      sendOf({ tasks: 1, batches: 0, streams: 0, dropReason: 'no text' }, 'folder', 0),
      {
        route: NONE,
        store: 'folder',
        readers: 0,
        tasks: 1,
        batches: 0,
        dropped: 0,
        problem: 'no text',
      },
    ))

  it('the session record never carries the bridge token', async () => {
    const server = new BridgeServer(async () => undefined)
    const address = await server.start()
    try {
      const withToken = planSession({
        projectPath: '/work/demo',
        agent: agentOf('claude'),
        command: 'claude',
        extras: { args: [], env: { Y_REVIEW_TEST_TOKEN: address.token }, reach: NO_REACH },
        windows: false,
        shell: '/bin/sh',
      })
      const text = exits(
        sessionRecord(
          await startOf(
            withToken,
            { bridgeReady: true, bridgeUrl: address.url },
            { agentCommand: 'default', terminalStarted: true },
          ),
        ),
      )
      assert.ok(text.includes(address.url), 'a maintainer needs the port')
      assert.ok(!text.includes(address.token), text)
    } finally {
      await server.stop()
    }
  })

  it('a session record holds no token, password, absolute path, remote, mail or comment', async () => {
    const server = new BridgeServer(async () => undefined)
    const address = await server.start()
    try {
      const agent = agentOf('opencode')
      const extras = {
        ...bridgeExtras({
          agent,
          bridge: {
            kind: 'available',
            url: address.url,
            path: `${HOME}/.y-review/bridge/vscode/project.json`,
          },
          sessionKey: 'aaaaaaaa11111111',
          launch: channelLaunch(`${HOME}/ext/dist/channel.js`, `${HOME}/vscode/code`),
          configFile: `${HOME}/.y-review/mcp/agent-vscode.json`,
          server: new LocalServer(51234, PASSWORD, `${HOME}/.y-review/secret/a.txt`),
          channelScript: `/opt/probe-install/ext/dist/channel.js`,
        }),
        env: { TOKEN: address.token, OPENCODE_SERVER_PASSWORD: PASSWORD, MAIL, REMOTE },
      }
      const start = planSession({
        projectPath: PROJECT,
        agent,
        command: 'opencode',
        extras,
        windows: false,
        shell: '/usr/local/probe/bin/zsh',
      })
      const text = exits(
        sessionRecord(
          await startOf(start, extras, { agentCommand: 'default', terminalStarted: true }),
        ),
      )
      ;[
        address.token,
        PASSWORD,
        HOME,
        PROJECT,
        'probe-user',
        'probe-install',
        REMOTE,
        MAIL,
      ].forEach((probe) => assert.ok(!text.includes(probe), `${probe} in ${text}`))
      assert.doesNotMatch(text, /(^|[\s'"=])(\/[A-Za-z]|[A-Za-z]:[\\/])/m)
    } finally {
      await server.stop()
    }
  })

  it('a send record holds no remote, mail, absolute path or comment', () => {
    const text = exits(
      sendRecord(
        sendOf(
          {
            tasks: 2,
            batches: 1,
            streams: 1,
            route: 'channel',
            problem: `The push to ${REMOTE} for ${MAIL} failed in ${PROJECT}/src.`,
            folder: COMMENT,
            targetName: COMMENT,
            agentReason: COMMENT,
          },
          'git',
          1,
        ),
      ),
    )
    ;[REMOTE, MAIL, PROJECT, COMMENT].forEach((probe) =>
      assert.ok(!text.includes(probe), `${probe} in ${text}`),
    )
  })

  it('a send record of a real report holds counts only', () =>
    assert.deepEqual(
      sendRecord(
        sendOf({ tasks: 2, batches: 0, streams: 0, route: 'noSession' }, 'folder', 0),
      ).facts.map(([name]) => name),
      ['route', 'store', 'readers', 'tasks', 'batches', 'dropped', 'problem'],
    ))
})
