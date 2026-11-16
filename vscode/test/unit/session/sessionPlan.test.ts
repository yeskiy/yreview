import assert from 'node:assert/strict'

import { type AgentId, agentOf } from '../../../src/session/catalog'
import {
  NO_COMMAND,
  type SessionExtras,
  WITHOUT_CHANNEL,
  planSession,
} from '../../../src/session/sessionPlan'
import { NO_REACH } from '../../../src/session/sessionReach'
import { shellLine } from '../../../src/session/shellCommand'

const plain: SessionExtras = { args: [], env: {}, reach: NO_REACH }
const plan = (id: AgentId, command: string, extras = plain, windows = false) =>
  planSession({
    projectPath: '/work',
    agent: agentOf(id),
    command,
    extras,
    windows,
    shell: '/bin/bash',
  })

describe('session plan', () => {
  it('the plan runs the command in the project directory', () => {
    assert.equal(plan('claude', 'claude').workingDirectory, '/work')
  })

  it('the plan runs the command of the settings', () => {
    assert.equal(
      plan('claude', '/opt/claude').shellArgs.at(-1),
      shellLine(['/opt/claude'], undefined, false),
    )
  })

  it('a command with arguments runs as words, and the flags of Yreview follow them', () => {
    const extras: SessionExtras = { ...plain, args: ['--mcp-config', '/tmp/a b.json'] }
    assert.equal(
      plan('claude', `claude --model opus "--name=a b"`, extras).shellArgs.at(-1),
      shellLine(
        ['claude', '--model', 'opus', '--name=a b', '--mcp-config', '/tmp/a b.json'],
        undefined,
        false,
      ),
    )
    const whole = planSession({
      projectPath: '/work',
      agent: agentOf('custom'),
      command: '/opt/my agent/run',
      commandIsFile: true,
      extras: plain,
      windows: false,
      shell: '/bin/sh',
    })
    assert.equal(whole.shellArgs.at(-1), shellLine(['/opt/my agent/run'], undefined, false))
    assert.equal(
      plan('custom', 'bash /path/script.sh', plain, true).shellArgs.at(-1),
      shellLine(['bash', '/path/script.sh'], undefined, true),
    )
  })

  it('the plan converts a wsl project path on windows', () => {
    const windows = planSession({
      projectPath: '/mnt/c/work/',
      agent: agentOf('claude'),
      command: 'claude',
      extras: plain,
      windows: true,
    })
    assert.equal(windows.workingDirectory, 'C:/work')
    assert.equal(windows.shellPath, 'powershell.exe')
  })

  it('the plan keeps the project path of another system', () => {
    assert.equal(
      planSession({
        projectPath: '/mnt/c/work',
        agent: agentOf('claude'),
        command: 'claude',
        extras: plain,
        windows: false,
        shell: '/bin/sh',
      }).workingDirectory,
      '/mnt/c/work',
    )
  })

  it('an agent without a channel runs plain', () => {
    assert.deepEqual(plan('gemini', 'gemini').shellArgs, [
      '-l',
      '-c',
      shellLine(['gemini'], undefined, false),
    ])
    assert.deepEqual(plan('gemini', 'gemini').environment, {})
  })

  it('the status of an agent that takes no message names the agent and the way out', () => {
    assert.equal(
      plan('gemini', 'gemini').status,
      'Gemini CLI does not accept a message into a running session. Run Copy Review Tasks, then paste the prompt in the session.',
    )
  })

  it('the status of a command of the user names no product', () => {
    assert.ok(!plan('custom', '/bin/my-agent').status.toLowerCase().includes('another agent'))
  })

  it('an agent with no command yet says so', () => {
    assert.equal(plan('custom', ' ').status, NO_COMMAND)
  })

  it('a session with no password file sets no password anywhere', () => {
    const opencode = plan('opencode', 'opencode')
    assert.ok(!opencode.shellArgs.join(' ').includes('PASSWORD'))
    assert.deepEqual(opencode.environment, {})
  })

  it('no status text names Node or Java', () => {
    ;(['claude', 'opencode', 'gemini', 'custom', 'none'] as const).forEach((id) =>
      assert.doesNotMatch(plan(id, 'x').status, /\b(Node|Java)\b/),
    )
  })

  it('a push agent without a preparer starts without the channel', () => {
    assert.equal(plan('claude', 'claude').status, WITHOUT_CHANNEL)
  })

  it('the extras reach the command line and the environment', () => {
    const extras: SessionExtras = {
      args: ['--mcp-config', '/tmp/a b.json'],
      env: { Y_REVIEW_BRIDGE_FILE: '/tmp/bridge.json' },
      secret: { name: 'OPENCODE_SERVER_PASSWORD', path: '/tmp/p' },
      status: 'The review bridge is ready.',
      reach: NO_REACH,
    }
    const full = plan('claude', 'claude', extras)
    assert.ok(full.shellArgs.at(-1)?.includes("'claude' '--mcp-config' '/tmp/a b.json';"))
    assert.ok(full.shellArgs.at(-1)?.startsWith('OPENCODE_SERVER_PASSWORD="$(cat'))
    assert.deepEqual(full.environment, { Y_REVIEW_BRIDGE_FILE: '/tmp/bridge.json' })
    assert.equal(full.status, 'The review bridge is ready.')
  })
})
