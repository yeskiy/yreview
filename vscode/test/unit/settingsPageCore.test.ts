import assert from 'node:assert/strict'

import { ARGUMENTS, type AgentChoice, NOT_FOUND, agentPickItem } from '../../src/settingsPageCore'

const choices: readonly AgentChoice[] = [
  {
    id: 'claude',
    label: 'Claude Code',
    product: true,
    found: '/usr/local/bin/claude',
    row: 'Claude Code, found on this machine. Send and Copy both work.',
    appended: '--mcp-config <the configuration file of the agent>',
  },
  {
    id: 'codex',
    label: 'Codex',
    product: true,
    found: undefined,
    row: 'Codex, not found on the search path of this editor. Send and Copy both work.',
  },
  {
    id: 'custom',
    label: 'Another agent',
    product: false,
    found: undefined,
    row: 'Another agent. Type the command.',
  },
]

describe('the rows of the agent pick', () => {
  it('shows each agent with the found path or the reason', () =>
    assert.deepEqual(
      choices
        .map((choice) => agentPickItem(choice, undefined))
        .map((item) => [item.label, item.description]),
      [
        ['Claude Code', '/usr/local/bin/claude'],
        ['Codex', NOT_FOUND],
        ['Another agent', ''],
      ],
    ))

  it('shows the row text and the arguments that Yreview adds', () =>
    assert.equal(
      agentPickItem(choices[0] ?? assert.fail('no choice'), undefined).detail,
      `${choices[0]?.row} ${ARGUMENTS} --mcp-config <the configuration file of the agent>`,
    ))

  it('shows the row text alone when no arguments are added', () =>
    assert.equal(
      agentPickItem(choices[1] ?? assert.fail('no choice'), undefined).detail,
      choices[1]?.row,
    ))

  it('marks the current agent', () =>
    assert.deepEqual(
      choices.map((choice) => agentPickItem(choice, 'codex').picked),
      [false, true, false],
    ))
})
