import { strict as assert } from 'node:assert'
import path from 'node:path'

import { AGENTS } from '../../../src/session/catalog'
import { configFileName, configFilePath, needsWrite } from '../../../src/session/configFile'

// "a build that names no product still names a file" has no port: the product code is fixed.
describe('config file (ConfigFileTest.kt)', () => {
  const home = path.join('E:', 'home')

  it('the file stands in the mcp folder of the Yreview root', () =>
    assert.equal(
      configFilePath(home, 'claude'),
      path.join(home, '.y-review', 'mcp', 'claude-vscode.json'),
    ))

  it('two sessions of one agent name the same file', () =>
    assert.equal(configFilePath(home, 'claude'), configFilePath(home, 'claude')))

  it('two agents name two files', () =>
    assert.equal(new Set(AGENTS.map((agent) => configFileName(agent.id))).size, AGENTS.length))

  it('the VS Code file never names an IDE code', () =>
    assert.equal(configFileName('claude'), 'claude-vscode.json'))

  it('the file name holds the agent, the product and the json suffix', () =>
    assert.equal(configFileName('opencode'), 'opencode-vscode.json'))

  it('the file name holds no character that a file system refuses', () =>
    AGENTS.forEach((agent) => assert.match(configFileName(agent.id), /^[a-z0-9-]+\.json$/)))

  it('a missing file needs a write', () => assert.equal(needsWrite(undefined, '{}'), true))

  it('the same content needs no write', () => assert.equal(needsWrite('{}', '{}'), false))

  it('changed content needs a write', () => assert.equal(needsWrite('{"a":1}', '{"a":2}'), true))
})
