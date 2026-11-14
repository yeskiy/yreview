import { strict as assert } from 'node:assert'
import { readFileSync, readdirSync, rmSync, statSync, utimesSync } from 'node:fs'
import path from 'node:path'

import {
  SERVER_NAME,
  channelLaunch,
  configText,
  launcherLaunch,
  writeChannelConfig,
} from '../../../src/session/channelConfig'
import { configFilePath } from '../../../src/session/configFile'
import { scratchDir } from '../../fixtures/scratch'

const EXEC = 'C:\\Program Files\\Microsoft VS Code\\Code.exe'
const SCRIPT = 'C:\\Users\\one\\.vscode\\extensions\\yeskiy.y-review\\dist\\channel.js'
const launch = channelLaunch(SCRIPT, EXEC)

type Entry = Record<string, unknown>
const text = (): string => configText('claude', launch)
const entry = (value: string): Entry =>
  (JSON.parse(value) as { mcpServers: { 'y-review': Entry } }).mcpServers[SERVER_NAME]

// "the jar of the channel server names the same main class" and "two jetbrains products
// write two files" have no port: VS Code runs no jar and writes one product code.
describe('channel config (ChannelConfigTest.kt)', () => {
  const held = { home: '' }
  beforeEach(() => {
    held.home = scratchDir()
  })
  afterEach(() => rmSync(held.home, { recursive: true, force: true }))

  it('the file declares one stdio server named y-review', () => {
    const servers = (JSON.parse(text()) as { mcpServers: { 'y-review': Entry } }).mcpServers
    assert.deepEqual(Object.keys(servers), ['y-review'])
    assert.equal(servers['y-review'].type, 'stdio')
  })

  it('the server runs the runtime of VS Code with dist/channel.js', () => {
    assert.equal(entry(text()).command, EXEC)
    assert.deepEqual(entry(text()).args, [SCRIPT])
  })

  it('the default runtime is the runtime of this process', () =>
    assert.equal(channelLaunch(SCRIPT).command, process.execPath))

  it('the file carries ELECTRON_RUN_AS_NODE and nothing else', () => {
    assert.deepEqual(entry(text()).env, { ELECTRON_RUN_AS_NODE: '1' })
    assert.deepEqual(Object.keys(entry(text())), ['type', 'command', 'args', 'env'])
  })

  it('the file holds no bridge variable', () => {
    assert.equal(text().includes('Y_REVIEW_BRIDGE'), false)
    assert.doesNotMatch(text(), /[0-9a-f]{64}/)
  })

  it('a written file stands at the stable path and holds the text', async () => {
    const file = await writeChannelConfig('claude', launch, held.home)
    assert.equal(file, configFilePath(held.home, 'claude'))
    assert.equal(statSync(file).isFile(), true)
    assert.equal(readFileSync(file, 'utf8'), text())
  })

  it('a written file is private to the user', async function privateConfig() {
    if (process.platform === 'win32') this.skip()
    assert.equal(
      statSync(await writeChannelConfig('claude', launch, held.home)).mode % 0o1000,
      0o600,
    )
  })

  it('two sessions of one agent write the same file and it stays', async () => {
    const first = await writeChannelConfig('claude', launch, held.home)
    const second = await writeChannelConfig('claude', launch, held.home)
    assert.equal(first, second)
    assert.equal(statSync(second).isFile(), true)
  })

  it('two agents write two files of their own shape', async () => {
    const claude = await writeChannelConfig('claude', launch, held.home)
    const opencode = await writeChannelConfig('opencode', launch, held.home)
    assert.notEqual(claude, opencode)
    assert.equal(readFileSync(claude, 'utf8').includes('mcpServers'), true)
    assert.equal(readFileSync(opencode, 'utf8').includes('"mcp"'), true)
  })

  it('the same content twice leaves the file alone', async () => {
    const file = await writeChannelConfig('claude', launch, held.home)
    utimesSync(file, 0, 0)
    await writeChannelConfig('claude', launch, held.home)
    assert.equal(statSync(file).mtimeMs, 0)
    assert.equal(readFileSync(file, 'utf8'), text())
  })

  it('changed content writes the file again', async () => {
    const file = await writeChannelConfig('claude', launch, held.home)
    utimesSync(file, 0, 0)
    const moved = channelLaunch(SCRIPT, 'C:\\Program Files\\Microsoft VS Code 2\\Code.exe')
    await writeChannelConfig('claude', moved, held.home)
    assert.equal(readFileSync(file, 'utf8'), configText('claude', moved))
    assert.notEqual(statSync(file).mtimeMs, 0)
  })

  it('a write leaves no temporary file beside the target', async () => {
    const file = await writeChannelConfig('claude', launch, held.home)
    assert.deepEqual(readdirSync(path.dirname(file)), [path.basename(file)])
  })

  it('opencode reads one array that holds the program and its arguments', () => {
    const server = (JSON.parse(configText('opencode', launch)) as { mcp: { 'y-review': Entry } })
      .mcp[SERVER_NAME]
    assert.deepEqual(server, {
      type: 'local',
      command: [EXEC, SCRIPT],
      enabled: true,
      environment: { ELECTRON_RUN_AS_NODE: '1' },
    })
  })

  it('every other agent reads the mcpServers shape', () =>
    (['claude', 'gemini', 'copilot', 'cursor'] as const).forEach((id) => {
      assert.equal(configText(id, launch).includes('mcpServers'), true, id)
      assert.equal(configText(id, launch).includes('"mcp"'), false, id)
    }))

  it('the launcher route of windows starts the launcher through cmd', () =>
    assert.deepEqual(launcherLaunch('C:\\h\\y-review-channel.cmd', true, 'C:\\cmd.exe'), {
      command: 'C:\\cmd.exe',
      args: ['/d', '/c', 'C:\\h\\y-review-channel.cmd'],
      env: {},
    }))

  it('the launcher route of posix starts the launcher alone and writes no env block', () => {
    const posix = launcherLaunch('/h/y-review-channel', false)
    assert.deepEqual(posix, { command: '/h/y-review-channel', args: [], env: {} })
    assert.deepEqual(Object.keys(entry(configText('cursor', posix))), ['type', 'command', 'args'])
  })
})
