import assert from 'node:assert/strict'
import path from 'node:path'

import { NOTHING, searchAgent, searchAgents } from '../../../src/session/agentSearch'
import { AGENTS, type AgentSpec, agentOf } from '../../../src/session/catalog'
import type { Runnable, SearchEnv } from '../../../src/session/pathLookup'

const folders = ['/home/dev/.local/bin', '/opt/homebrew/bin']

const claude = agentOf('claude')

const never: Runnable = () => Promise.resolve(false)

const only =
  (...wanted: string[]): Runnable =>
  (file) =>
    Promise.resolve(wanted.includes(file))

const posix = (value?: string): SearchEnv => ({
  path: value,
  pathExt: undefined,
  windows: false,
  separator: ':',
})

const one = (runnable: Runnable, spec: AgentSpec = claude, value?: string) =>
  searchAgent(spec, posix(value), folders, runnable)

describe('agent search', () => {
  it('an empty machine reports nothing', async () => {
    const install = await one(never)
    assert.equal(install.path, undefined)
    assert.deepEqual(install, NOTHING)
    assert.equal(install.source, 'none')
  })

  it('the PATH answer wins over a folder', async () => {
    const install = await one(() => Promise.resolve(true), claude, '/usr/bin')
    assert.equal(install.source, 'path')
    assert.equal(install.path, path.posix.join('/usr/bin', 'claude'))
  })

  it('a folder answers when the PATH holds nothing', async () => {
    const wanted = path.posix.join('/opt/homebrew/bin', 'claude')
    const install = await one(only(wanted))
    assert.equal(install.source, 'folder')
    assert.equal(install.path, wanted)
  })

  it('a file the PATH search rejects is not found again in a folder', async () => {
    const install = await searchAgent(
      claude,
      posix('/opt/homebrew/bin'),
      ['/opt/homebrew/bin'],
      never,
    )
    assert.equal(install.path, undefined)
  })

  it('windows looks for a shim with an extension', async () => {
    const volta = path.win32.join('C:\\Volta\\bin', 'codex.CMD')
    const install = await searchAgent(
      agentOf('codex'),
      { path: undefined, pathExt: '.COM;.EXE;.CMD', windows: true, separator: ';' },
      ['C:\\Volta\\bin'],
      only(volta),
    )
    assert.equal(install.source, 'folder')
    assert.equal(install.path, volta)
  })

  it('the second name of an agent still answers', async () => {
    const wanted = path.posix.join('/home/dev/.local/bin', 'agent')
    const install = await one(only(wanted), agentOf('cursor'))
    assert.equal(install.path, wanted)
  })

  it('an agent that names no command is never found', async () => {
    const install = await one(() => Promise.resolve(true), agentOf('custom'))
    assert.equal(install.path, undefined)
  })

  it('one scan answers for every agent of the catalog', async () => {
    const answers = await searchAgents(AGENTS, posix(), folders, never)
    assert.deepEqual(new Set(answers.keys()), new Set(AGENTS.map((spec) => spec.id)))
    assert.ok([...answers.values()].every((install) => install.path === undefined))
  })

  it('a scan that found two agents names them', async () => {
    const answers = await searchAgents(
      AGENTS,
      posix(),
      folders,
      only('/opt/homebrew/bin/claude', '/opt/homebrew/bin/opencode'),
    )
    assert.deepEqual(
      [...answers].filter(([, install]) => install.path !== undefined).map(([id]) => id),
      ['claude', 'opencode'],
    )
  })
})
