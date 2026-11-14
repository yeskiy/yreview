import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

interface Property {
  readonly scope?: string
  readonly default?: unknown
}

const manifest = JSON.parse(
  readFileSync(path.resolve(__dirname, '../../../package.json'), 'utf8'),
) as {
  contributes: {
    commands: readonly { command: string }[]
    configuration: { properties: Readonly<Record<string, Property>> }
    views: Readonly<Record<string, readonly { id: string }[]>>
  }
}
const { properties } = manifest.contributes.configuration

describe('session manifest', () => {
  it('a repository cannot choose the program (S8)', () => {
    assert.equal(properties['yreview.agent']?.scope, 'machine')
    assert.equal(properties['yreview.agentCommands']?.scope, 'machine')
  })

  it('declares every session command', () => {
    const commands = manifest.contributes.commands.map((entry) => entry.command)
    ;[
      'startSession',
      'stopSession',
      'renameSession',
      'showSession',
      'chooseAgent',
      'setAgentCommand',
    ].forEach((name) => assert.ok(commands.includes(`yreview.${name}`), name))
  })

  it('declares the session view in its own panel container', () => {
    assert.deepEqual(
      manifest.contributes.views.yreviewSession?.map((view) => view.id),
      ['yreview.sessions'],
    )
  })

  it('starts a session when the panel opens unless the user turns it off', () => {
    assert.equal(properties['yreview.autoStartSession']?.default, true)
  })
})
