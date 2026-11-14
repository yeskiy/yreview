import assert from 'node:assert/strict'

import { isKotlinBlank } from '../../../src/core/kotlinText'
import {
  AGENTS,
  type AgentId,
  DEFAULT_AGENT,
  agentOf,
  defaultCommand,
  isRenamable,
  isRunnable,
  orderedAgents,
  parseAgent,
} from '../../../src/session/catalog'

const IDS: readonly AgentId[] = [
  'claude',
  'opencode',
  'codex',
  'antigravity',
  'gemini',
  'copilot',
  'cursor',
  'aider',
  'amp',
  'custom',
  'none',
]

describe('agent catalog', () => {
  it('the catalog holds one record for every identifier', () => {
    assert.deepEqual(new Set(AGENTS.map((spec) => spec.id)), new Set(IDS))
    assert.equal(AGENTS.length, IDS.length)
  })

  it('claude code is the default and it carries the channel', () => {
    assert.equal(DEFAULT_AGENT, 'claude')
    assert.equal(agentOf('claude').push, 'channel')
    assert.equal(defaultCommand(agentOf('claude')), 'claude')
  })

  it('exactly two agents take a send', () => {
    assert.deepEqual(
      AGENTS.filter((spec) => spec.push !== 'none').map((spec) => spec.id),
      ['claude', 'opencode'],
    )
    assert.equal(agentOf('opencode').push, 'local_http')
  })

  it('a per session route names its flag or its variable', () => {
    assert.deepEqual(agentOf('claude').mcp, { kind: 'flag', flag: '--mcp-config', prefix: '' })
    assert.deepEqual(agentOf('opencode').mcp, { kind: 'variable', name: 'OPENCODE_CONFIG' })
    assert.deepEqual(agentOf('codex').mcp, { kind: 'keys' })
    assert.deepEqual(agentOf('gemini').mcp, {
      kind: 'variable',
      name: 'GEMINI_CLI_SYSTEM_DEFAULTS_PATH',
    })
    assert.deepEqual(agentOf('copilot').mcp, {
      kind: 'flag',
      flag: '--additional-mcp-config',
      prefix: '@',
    })
  })

  it('a stored route asks the user first', () => {
    assert.deepEqual(agentOf('antigravity').mcp, { kind: 'addCommand' })
    assert.deepEqual(agentOf('cursor').mcp, { kind: 'userFile', path: '.cursor/mcp.json' })
  })

  it('an agent with no proved route registers nothing', () => {
    ;(['aider', 'amp', 'custom', 'none'] as const).forEach((id) =>
      assert.deepEqual(agentOf(id).mcp, { kind: 'none' }, id),
    )
  })

  it('the none entry runs nothing and names no command', () => {
    const none = agentOf('none')
    assert.equal(isRunnable(none), false)
    assert.deepEqual(none.commands, [])
    assert.equal(none.push, 'none')
  })

  it('the custom entry runs a command the user names', () => {
    const custom = agentOf('custom')
    assert.equal(isRunnable(custom), true)
    assert.deepEqual(custom.commands, [])
    assert.equal(defaultCommand(custom), '')
  })

  it('the cursor record holds both installed names', () => {
    assert.deepEqual(agentOf('cursor').commands, ['cursor-agent', 'agent'])
  })

  it('a brand with a desktop application says so', () => {
    assert.equal(agentOf('claude').desktop?.label, 'Claude Desktop')
    assert.equal(agentOf('claude').desktop?.sharesConfig, false)
    assert.equal(agentOf('codex').desktop?.sharesConfig, true)
    assert.equal(agentOf('antigravity').desktop?.sharesConfig, true)
    assert.equal(agentOf('cursor').desktop?.sharesConfig, true)
    assert.equal(agentOf('copilot').desktop, null)
    assert.equal(agentOf('none').desktop, null)
  })

  it('every desktop note says that the window cannot run it', () => {
    AGENTS.flatMap((spec) => spec.desktop ?? []).forEach((desktop) => {
      assert.ok(desktop.note.includes('cannot run it'), desktop.label)
      assert.ok(!isKotlinBlank(desktop.label))
    })
  })

  it('every record carries a label and a hint', () => {
    AGENTS.forEach((spec) => {
      assert.ok(!isKotlinBlank(spec.label), `${spec.id} has no label`)
      assert.ok(!isKotlinBlank(spec.hint), `${spec.id} has no hint`)
    })
  })

  it('the found agents stand first and none stands last', () => {
    const order = orderedAgents(new Set<AgentId>(['gemini', 'codex'])).map((spec) => spec.id)
    assert.deepEqual(order.slice(0, 2), ['codex', 'gemini'])
    assert.equal(order.at(-1), 'none')
    assert.equal(order.length, IDS.length)
  })

  it('a stored name comes back as the same identifier', () => {
    IDS.forEach((id) => assert.equal(parseAgent(id), id))
  })

  it('an unknown stored name is not a choice', () => {
    assert.equal(parseAgent(undefined), undefined)
    assert.equal(parseAgent(''), undefined)
    assert.equal(parseAgent('   '), undefined)
    assert.equal(parseAgent('WINDSURF'), undefined)
    assert.equal(parseAgent('ROBOT'), undefined)
    assert.equal(parseAgent('CLAUDE'), undefined)
  })

  it('every record carries a short name that fits a tab', () => {
    AGENTS.forEach((spec) => {
      assert.ok(!isKotlinBlank(spec.short), `${spec.id} has no short name`)
      assert.ok(
        spec.short.length <= 12,
        `${spec.id} has a short name of ${spec.short.length} characters`,
      )
    })
  })

  it('the short name of every agent is the one the tab shows', () => {
    assert.deepEqual(
      AGENTS.map((spec) => spec.short),
      [
        'Claude',
        'OpenCode',
        'Codex',
        'Antigravity',
        'Gemini',
        'Copilot',
        'Cursor',
        'Aider',
        'Amp',
        'Agent',
        'Session',
      ],
    )
  })

  it('five agents name their own sessions', () => {
    assert.deepEqual(
      AGENTS.filter((spec) => spec.naming.kind === 'agent').map((spec) => spec.id),
      ['claude', 'opencode', 'antigravity', 'copilot', 'cursor'],
    )
  })

  it('an agent that names its own session takes no rename from the plugin', () => {
    assert.equal(isRenamable(agentOf('claude')), false)
    assert.equal(isRenamable(agentOf('cursor')), false)
  })

  it('every other agent leaves the name to the user', () => {
    ;(['codex', 'gemini', 'aider', 'amp', 'custom', 'none'] as const).forEach((id) =>
      assert.equal(isRenamable(agentOf(id)), true, id),
    )
  })

  it('an agent that owns the name names the command the user types', () => {
    AGENTS.forEach((spec) => {
      if (spec.naming.kind === 'agent')
        assert.ok(spec.naming.command.startsWith('/'), spec.naming.command)
    })
    assert.deepEqual(agentOf('claude').naming, { kind: 'agent', command: '/rename' })
  })

  it('the plugin offers a rename for every agent that names no session of its own', () => {
    AGENTS.forEach((spec) => assert.equal(isRenamable(spec), spec.naming.kind === 'user', spec.id))
  })

  it('every agent answers who names a session', () => {
    const byAgent = AGENTS.filter((spec) => spec.naming.kind === 'agent').map((spec) => spec.id)
    const byUser = AGENTS.filter((spec) => spec.naming.kind === 'user').map((spec) => spec.id)
    assert.deepEqual(new Set([...byAgent, ...byUser]), new Set(IDS))
    assert.equal(byAgent.length + byUser.length, IDS.length)
  })
})
