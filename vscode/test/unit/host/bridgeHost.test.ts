import { strict as assert } from 'node:assert'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { type IncomingHttpHeaders, request } from 'node:http'
import path from 'node:path'

import type { BatchTask } from '../../../src/bridge/batchBuilder'
import { bridgeFilePath } from '../../../src/bridge/discoveryFile'
import { BridgeHost, type BridgeLookup, type HostDeps } from '../../../src/bridge/host'
import { TOKEN_HEADER } from '../../../src/bridge/token'
import { SESSION_HEADER } from '../../../src/session/sessionKey'
import { removeDir, scratchDir } from '../../fixtures/scratch'

const KEY_A = 'aaaaaaaa11111111'
const KEY_B = 'bbbbbbbb22222222'
const COMMIT = '4f2c8b1c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6'
const LONG_ID = 'c3f9a12aabbccddeeff00112233445566778899a'
const task = (id: string): BatchTask => ({
  id,
  path: 'src/a.ts',
  startLine: 1,
  endLine: 2,
  revision: 'HEAD',
  text: 'Fix it.',
})

interface Entry {
  readonly url: string
  readonly token: string
  readonly projectPath: string
  readonly pid: number
}

const available = (lookup: BridgeLookup): { url: string; path: string } => {
  if (lookup.kind !== 'available') return assert.fail(`the bridge is ${lookup.kind}`)
  return lookup
}

const entryOf = (file: string): Entry => JSON.parse(readFileSync(file, 'utf8')) as Entry

const post = (url: string, headers: Record<string, string>, body: string): Promise<number> =>
  new Promise((resolve, reject) => {
    const sent = request(url, { method: 'POST', headers })
    sent.on('response', (response) => {
      response.resume()
      response.on('end', () => resolve(response.statusCode ?? 0))
    })
    sent.on('error', reject)
    sent.end(body)
  })

/** Opens /events and gives a function that ends the stream. */
const openStream = (url: string, headers: Record<string, string>) => {
  const sent = request(`${url}/events`, { headers })
  const opened = new Promise<IncomingHttpHeaders>((resolve) => {
    sent.on('response', (response) => {
      response.resume()
      resolve(response.headers)
    })
  })
  sent.on('error', () => undefined)
  sent.end()
  return { opened, close: () => sent.destroy() }
}

const connects = (url: string): Promise<boolean> =>
  new Promise((resolve) => {
    const sent = request(`${url}/events`)
    sent.on('response', (response) => {
      response.resume()
      resolve(true)
    })
    sent.on('error', () => resolve(false))
    sent.end()
  })

const until = async (check: () => boolean, ms = 5000): Promise<void> => {
  const deadline = Date.now() + ms
  const step = async (): Promise<void> => {
    if (check()) return undefined
    if (Date.now() > deadline) throw new Error('the condition never held')
    await new Promise((resolve) => {
      setTimeout(resolve, 20)
    })
    return step()
  }
  return step()
}

describe('bridge host (BridgeCloseTest.kt, ReceiverCountTest.kt, LiveChoicesTest.kt)', () => {
  const home = scratchDir()
  const project = path.join(home, 'project')
  mkdirSync(project)
  const state = {
    channel: true,
    warnings: [] as string[],
    resolved: [] as { ids: readonly string[]; session: string | undefined }[],
    hosts: [] as BridgeHost[],
  }
  const deps = (): HostDeps => ({
    channelOn: () => state.channel,
    projectPath: () => project,
    home: () => home,
    onResolve: async (ids, session) => {
      state.resolved.push({ ids, session })
      return undefined
    },
    routes: new Map(),
    warn: (message) => state.warnings.push(message),
    pid: 4242,
  })
  const newHost = (): BridgeHost => {
    const host = new BridgeHost(deps())
    state.hosts.push(host)
    return host
  }

  beforeEach(() => {
    state.channel = true
    state.warnings = []
    state.resolved = []
  })
  afterEach(async () => {
    await Promise.all(state.hosts.splice(0).map((host) => host.dispose()))
  })
  after(() => removeDir(home))

  it('a start that runs after the close opens no port', async () => {
    const host = newHost()
    const first = available(await host.start())
    await host.dispose()
    const lookup = await host.start()
    assert.equal(lookup.kind, 'unavailable')
    assert.equal(await connects(first.url), false)
  })

  it('a start that runs after the close writes no file for a session', async () => {
    const host = newHost()
    await host.dispose()
    await host.start()
    assert.equal(existsSync(bridgeFilePath(project, home)), false)
  })

  it('a start before the close still opens a port', async () => {
    const lookup = available(await newHost().start())
    assert.equal(lookup.path, bridgeFilePath(project, home))
    assert.equal(existsSync(lookup.path), true)
  })

  it('two starts at the same time open one port', async () => {
    const host = newHost()
    const [one, two] = await Promise.all([host.start(), host.start()])
    assert.equal(available(one).url, available(two).url)
  })

  it('a closed switch opens no port', async () => {
    state.channel = false
    assert.deepEqual(await newHost().start(), { kind: 'channelOff' })
  })

  it('a switch that closes gives the port back and removes the file', async () => {
    const host = newHost()
    const lookup = available(await host.start())
    state.channel = false
    await host.applySwitch(false)
    assert.equal(existsSync(lookup.path), false)
    assert.equal(await connects(lookup.url), false)
  })

  it('the discovery file holds the four fields and the pid', async () => {
    const lookup = available(await newHost().start())
    const entry = entryOf(lookup.path)
    assert.deepEqual(Object.keys(entry).sort(), ['pid', 'projectPath', 'token', 'url'])
    assert.equal(entry.url, lookup.url)
    assert.match(entry.token, /^[0-9a-f]{64}$/)
    assert.equal(entry.projectPath, project)
    assert.equal(entry.pid, 4242)
  })

  it('a window that closes keeps the file that another window wrote', async () => {
    const first = newHost()
    available(await first.start())
    const second = available(await newHost().start())
    const { token } = entryOf(second.path)
    await first.dispose()
    assert.equal(entryOf(second.path).token, token)
  })

  it('a start writes the file again when another window removed it', async () => {
    const first = newHost()
    const lookup = available(await first.start())
    const { token } = entryOf(lookup.path)
    const second = newHost()
    available(await second.start())
    await second.dispose()
    assert.equal(existsSync(lookup.path), false)
    available(await first.start())
    assert.equal(entryOf(lookup.path).token, token)
  })

  it('a start writes the file again when it holds the token of another window', async () => {
    const first = newHost()
    const lookup = available(await first.start())
    const { token } = entryOf(lookup.path)
    available(await newHost().start())
    assert.notEqual(entryOf(lookup.path).token, token)
    available(await first.start())
    assert.equal(entryOf(lookup.path).token, token)
  })

  it('a send names the folder that is not a repository', async () => {
    const report = await newHost().sendTasks('main', undefined, [task('yabc12')])
    assert.equal(report.problem, 'The repository has no commit yet.')
    assert.equal(report.streams, 0)
  })

  it('a send reports the dropped tasks in the log', async () => {
    const report = await newHost().sendTasks('main', COMMIT, [task('yabc12'), task('bad id!')])
    assert.equal(report.dropped, 1)
    assert.equal(state.warnings.length, 1)
    assert.match(state.warnings[0] ?? '', /bad id! \(the identifier breaks the channel rule\)/)
  })

  it('a send reaches the named stream only', async () => {
    const host = newHost()
    const lookup = available(await host.start())
    const { token } = entryOf(lookup.path)
    const streams = [KEY_A, KEY_B].map((key) =>
      openStream(lookup.url, { [TOKEN_HEADER]: token, [SESSION_HEADER]: key }),
    )
    await Promise.all(streams.map((stream) => stream.opened))
    await until(() => host.readerCount() === 2)
    assert.deepEqual([...host.openKeys()].sort(), [KEY_A, KEY_B])
    const report = await host.sendTasks('main', COMMIT, [task('yabc12')], KEY_A, 'Claude 1')
    streams.forEach((stream) => stream.close())
    assert.equal(report.streams, 1)
    assert.equal(report.targetName, 'Claude 1')
    assert.equal(report.tasks, 1)
  })

  it('the resolve route hands ids and the session to the close', async () => {
    const lookup = available(await newHost().start())
    const { token } = entryOf(lookup.path)
    const status = await post(
      `${lookup.url}/resolve`,
      { [TOKEN_HEADER]: token, [SESSION_HEADER]: KEY_A, 'Content-Type': 'application/json' },
      JSON.stringify({ ids: [LONG_ID] }),
    )
    assert.equal(status, 200)
    assert.deepEqual(state.resolved, [{ ids: [LONG_ID], session: KEY_A }])
  })
})
