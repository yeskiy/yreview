import { strict as assert } from 'node:assert'

import type { BridgeLookup } from '../../../src/bridge/host'
import { type BridgeInput, bridgeExtras } from '../../../src/session/bridgePlan'
import { type AgentId, agentOf } from '../../../src/session/catalog'
import { channelLaunch } from '../../../src/session/channelConfig'
import { LocalServer } from '../../../src/session/localServer'
import { WITHOUT_CHANNEL } from '../../../src/session/sessionPlan'

const EXEC = '/opt/vscode/code'
const SCRIPT = '/home/one/.vscode/extensions/yeskiy.yreview/dist/channel.js'
const FILE = '/home/one/.y-review/bridge/vscode/project-0123456789abcdef.json'
const CONFIG = '/home/one/.y-review/mcp/agent-vscode.json'
const BRIDGE_URL = 'http://127.0.0.1:43123'
const TOKEN = 'a'.repeat(64)
const KEY = 'aaaaaaaa11111111'
const PASSWORD = 'b'.repeat(64)
const SECRET = '/home/one/.y-review/secret/aaaaaaaa11111111.txt'
const launch = channelLaunch(SCRIPT, EXEC)
const ready: BridgeLookup = { kind: 'available', url: BRIDGE_URL, path: FILE }
const missing: BridgeLookup = { kind: 'unavailable', reason: 'The window has no folder.' }
const server = new LocalServer(51234, PASSWORD, SECRET)

const extras = (id: AgentId, given: Partial<BridgeInput> = {}) =>
  bridgeExtras({
    agent: agentOf(id),
    bridge: ready,
    sessionKey: KEY,
    launch,
    configFile: CONFIG,
    ...given,
  })

describe('bridge plan (SessionPlanTest.kt)', () => {
  it('no variable of the session holds the bridge token', () => {
    const plan = extras('claude')
    assert.equal(Object.values(plan.env).includes(TOKEN), false)
    assert.equal(
      plan.args.some((arg) => arg.includes(TOKEN)),
      false,
    )
  })

  it('the plan appends the two flags of the channel', () =>
    assert.deepEqual(extras('claude').args.slice(-2), [
      '--dangerously-load-development-channels',
      'server:y-review',
    ]))

  it('the plan hands the bridge to the session as the path of the bridge file', () =>
    assert.equal(extras('claude').env.Y_REVIEW_BRIDGE_FILE, FILE))

  it('a missing bridge still starts the session, a missing bridge is stated in the status text', () => {
    const plan = extras('claude', { bridge: missing })
    assert.deepEqual(plan.args, [])
    assert.ok(plan.status?.startsWith('The review bridge is not available yet.'), plan.status)
    assert.ok(plan.status?.includes('The window has no folder.'))
    assert.ok(plan.status?.endsWith(WITHOUT_CHANNEL))
    assert.equal(plan.bridgeReady, false)
    assert.equal(plan.bridgeUrl, '')
  })

  it('a ready bridge is stated in the status text', () => {
    const plan = extras('claude')
    assert.equal(plan.status, `The review bridge is ready at ${BRIDGE_URL}.`)
    assert.equal(plan.bridgeReady, true)
    assert.equal(plan.bridgeUrl, BRIDGE_URL)
  })

  it('a closed channel starts the session without the bridge, names the switch, never asks the user to wait', () => {
    const plan = extras('claude', { bridge: { kind: 'channelOff' } })
    assert.equal('Y_REVIEW_BRIDGE_FILE' in plan.env, false)
    assert.ok(plan.status?.startsWith('The review channel is off in the settings.'), plan.status)
    assert.equal(plan.status?.includes('wait'), false)
    assert.deepEqual(plan.args, [])
  })

  it('a channel server that is no file is named in the status text and never carries the flags', () => {
    const plan = extras('claude', { channelMissing: true })
    assert.ok(
      plan.status?.startsWith(
        'The channel server of Yreview is missing from the extension folder.',
      ),
      plan.status,
    )
    assert.equal(plan.args.includes('--dangerously-load-development-channels'), false)
    assert.equal(plan.args.includes('--mcp-config'), false)
    assert.equal(plan.bridgeReady, false)
  })

  it('the plan hands the session key to the session', () => {
    assert.equal(extras('claude').env.Y_REVIEW_SESSION_KEY, KEY)
    assert.equal('Y_REVIEW_SESSION_KEY' in extras('claude', { bridge: missing }).env, false)
    assert.equal(
      'Y_REVIEW_SESSION_KEY' in extras('claude', { bridge: { kind: 'channelOff' } }).env,
      false,
    )
  })

  it('an agent without a channel still reaches the bridge through the environment', () => {
    const plan = extras('codex', { configFile: undefined })
    assert.equal(plan.env.Y_REVIEW_BRIDGE_FILE, FILE)
    assert.equal(plan.args[0], '-c')
    assert.ok(plan.args.some((arg) => arg.startsWith('mcp_servers.y-review.command=')))
    assert.equal(plan.bridgeReady, false)
  })

  it('opencode listens on the port the plugin gave it', () =>
    assert.deepEqual(extras('opencode', { server }).args.slice(-4), [
      '--hostname',
      '127.0.0.1',
      '--port',
      '51234',
    ]))

  it('no variable and no part of the command line of an opencode session holds the server password', () => {
    const plan = extras('opencode', { server })
    assert.equal(
      plan.args.some((arg) => arg.includes(PASSWORD)),
      false,
    )
    assert.equal(
      Object.values(plan.env).some((value) => value.includes(PASSWORD)),
      false,
    )
    assert.equal(plan.status?.includes(PASSWORD), false)
  })

  it('the file that the shell line names holds the password of the server', () =>
    assert.deepEqual(extras('opencode', { server }).secret, {
      name: 'OPENCODE_SERVER_PASSWORD',
      path: SECRET,
    }))

  it('the reach of an opencode session names its port', () =>
    assert.deepEqual(extras('opencode', { server }).reach, {
      kind: 'localHttp',
      port: 51234,
      password: PASSWORD,
    }))

  it('the registration of opencode travels in the environment', () =>
    assert.equal(extras('opencode', { server }).env.OPENCODE_CONFIG, CONFIG))

  it('a session with no password file sets no password anywhere', () => {
    const plan = extras('opencode')
    assert.equal(plan.secret, undefined)
    assert.deepEqual(plan.reach, { kind: 'none' })
    assert.equal(plan.args.includes('--port'), false)
  })

  it('codex carries its dotted keys only while the whole server stands', () => {
    assert.equal(extras('codex', { launch: undefined }).args.includes('-c'), false)
    assert.equal(extras('codex', { bridge: missing }).args.includes('-c'), false)
  })
})
