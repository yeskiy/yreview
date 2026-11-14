import assert from 'node:assert/strict'

import { commandOf, commandsOf, withCommand } from '../../../src/session/agentCommands'
import { parseAgent } from '../../../src/session/catalog'

describe('agent commands', () => {
  it('the default command is claude', () => {
    assert.equal(commandOf('claude', {}), 'claude')
  })

  it('a fresh install has chosen no agent', () => {
    assert.equal(parseAgent(''), undefined)
  })

  it('a chosen agent comes back', () => {
    assert.equal(parseAgent('opencode'), 'opencode')
  })

  it('a stored name this build does not know counts as no choice', () => {
    assert.equal(parseAgent('robot'), undefined)
  })

  it('every agent keeps a command of its own', () => {
    const both = withCommand(withCommand({}, 'claude', '/opt/claude'), 'codex', '/opt/codex')
    assert.deepEqual(both, { claude: '/opt/claude', codex: '/opt/codex' })
    assert.equal(commandOf('claude', both), '/opt/claude')
    assert.equal(commandOf('codex', both), '/opt/codex')
  })

  it('a blank command falls back to the default of that agent', () => {
    assert.equal(commandOf('codex', { codex: '   ' }), 'codex')
    assert.deepEqual(withCommand({ codex: '/opt/codex' }, 'codex', ' '), {})
  })

  it('the custom agent has no default command', () => {
    assert.equal(commandOf('custom', {}), '')
  })

  it('the none choice is a real choice', () => {
    assert.equal(parseAgent('none'), 'none')
  })

  it('the default value removes the key', () => {
    assert.deepEqual(withCommand({ claude: '/opt/claude' }, 'claude', ' claude '), {})
  })

  it('a stored map drops an unknown key and a value that is no text', () => {
    assert.deepEqual(commandsOf({ claude: 'c', robot: 'r', codex: 3 }), { claude: 'c' })
  })

  it('a stored value that is no object gives an empty map', () => {
    assert.deepEqual(commandsOf('claude'), {})
    assert.deepEqual(commandsOf(null), {})
    assert.deepEqual(commandsOf(['claude']), {})
  })
})
