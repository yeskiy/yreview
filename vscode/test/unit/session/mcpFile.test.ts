import { strict as assert } from 'node:assert'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'

import { mergeMcp, writeMcpFile } from '../../../src/session/mcpFile'
import { scratchDir } from '../../fixtures/scratch'

const WANTED =
  '{"mcpServers":{"y-review":{"type":"stdio","command":"cmd","args":["/d","/c","l.cmd"]}}}'

type Servers = Record<'other' | 'y-review', { command: string }>

// The file of Cursor can hold servers of other tools. Add keeps them, and asks first.
describe('mcp file (McpFileTest.kt)', () => {
  const held = { folder: '', asked: [] as string[] }
  const file = (): string => path.join(held.folder, '.cursor', 'mcp.json')
  const approve = async (_file: string, text: string): Promise<boolean> => {
    held.asked.push(text)
    return true
  }
  const decline = async (_file: string, text: string): Promise<boolean> => {
    held.asked.push(text)
    return false
  }
  const place = (text: string): void => {
    mkdirSync(path.dirname(file()), { recursive: true })
    writeFileSync(file(), text)
  }
  const document = (): Record<string, unknown> =>
    JSON.parse(readFileSync(file(), 'utf8')) as Record<string, unknown>
  const servers = (): Servers => document().mcpServers as Servers
  const names = (): string[] => readdirSync(path.dirname(file()))
  beforeEach(() => {
    held.folder = scratchDir()
    held.asked = []
  })
  afterEach(() => rmSync(held.folder, { recursive: true, force: true }))

  it('the merge keeps the other servers and the other keys', async () => {
    place('{"mcpServers":{"other":{"command":"node","args":["a.js"]}},"inputs":[1]}')
    assert.deepEqual(await writeMcpFile(file(), WANTED, approve), { kind: 'written' })
    assert.deepEqual(Object.keys(servers()), ['other', 'y-review'])
    assert.equal(servers().other.command, 'node')
    assert.equal(servers()['y-review'].command, 'cmd')
    assert.deepEqual(document().inputs, [1])
  })

  it('the merge replaces an old entry of the review server', async () => {
    place('{"mcpServers":{"y-review":{"command":"old"}}}')
    await writeMcpFile(file(), WANTED, approve)
    assert.equal(servers()['y-review'].command, 'cmd')
  })

  it('a file that is not valid JSON stays unchanged', async () => {
    const broken = '{"mcpServers": {"other": '
    place(broken)
    const result = await writeMcpFile(file(), WANTED, approve)
    assert.equal(result.kind, 'problem')
    assert.equal(readFileSync(file(), 'utf8'), broken)
    assert.deepEqual(names(), ['mcp.json'])
    assert.deepEqual(held.asked, [])
  })

  it('a servers key that holds no object stays unchanged', async () => {
    const odd = '{"mcpServers":[]}'
    place(odd)
    assert.equal((await writeMcpFile(file(), WANTED, approve)).kind, 'problem')
    assert.equal(readFileSync(file(), 'utf8'), odd)
  })

  it('a servers key that holds a number stays unchanged', () =>
    assert.equal(mergeMcp('{"mcpServers":5}', WANTED).kind, 'problem'))

  it('a missing file is created', async () => {
    assert.deepEqual(await writeMcpFile(file(), WANTED, approve), { kind: 'written' })
    assert.deepEqual(Object.keys(servers()), ['y-review'])
    assert.deepEqual(names(), ['mcp.json'])
  })

  it('a number that JavaScript cannot hold stays as written', () => {
    const merged = mergeMcp('{"a":12345678901234567890,"b":1.0,"c":1e400}', WANTED)
    assert.equal(merged.kind, 'text')
    assert.match(merged.value, /"a": 12345678901234567890,/)
    assert.match(merged.value, /"b": 1\.0,/)
    assert.match(merged.value, /"c": 1e400,/)
  })

  it('a file with a comment stays unchanged', async () => {
    const commented = '// x\n{"mcpServers":{}}'
    place(commented)
    assert.equal((await writeMcpFile(file(), WANTED, approve)).kind, 'problem')
    assert.equal(readFileSync(file(), 'utf8'), commented)
  })

  it('the write leaves no temporary file', async () => {
    place('{"mcpServers":{}}')
    await writeMcpFile(file(), WANTED, approve)
    assert.deepEqual(names(), ['mcp.json'])
  })

  it('the question shows the whole text that the write puts in the file', async () => {
    place('{"mcpServers":{"other":{"command":"node"}}}')
    await writeMcpFile(file(), WANTED, approve)
    assert.deepEqual(held.asked, [readFileSync(file(), 'utf8')])
  })

  it('a declined merge changes no file that the user owns', async () => {
    const before = '{"mcpServers":{"other":{"command":"node"}}}'
    place(before)
    utimesSync(file(), 0, 0)
    assert.deepEqual(await writeMcpFile(file(), WANTED, decline), { kind: 'declined' })
    assert.equal(held.asked.length, 1)
    assert.equal(readFileSync(file(), 'utf8'), before)
    assert.equal(statSync(file()).mtimeMs, 0)
    assert.deepEqual(names(), ['mcp.json'])
  })

  it('a declined merge makes no file and no folder', async () => {
    assert.deepEqual(await writeMcpFile(file(), WANTED, decline), { kind: 'declined' })
    assert.equal(existsSync(path.dirname(file())), false)
  })

  it('an approval that fails changes no file', async () => {
    place('{}')
    await assert.rejects(
      writeMcpFile(file(), WANTED, async () => Promise.reject(new Error('closed'))),
    )
    assert.equal(readFileSync(file(), 'utf8'), '{}')
  })

  it('a file that exists keeps its mode', async function keptMode() {
    if (process.platform === 'win32') this.skip()
    place('{}')
    chmodSync(file(), 0o600)
    await writeMcpFile(file(), WANTED, approve)
    assert.equal(statSync(file()).mode % 0o1000, 0o600)
  })
})
