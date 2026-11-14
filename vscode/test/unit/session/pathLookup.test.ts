import assert from 'node:assert/strict'
import path from 'node:path'

import {
  DEFAULT_EXTENSIONS,
  type Runnable,
  type SearchEnv,
  commandNames,
  findOnPath,
  pathEntries,
  pathExtensions,
} from '../../../src/session/pathLookup'

const command = 'claude'

const only =
  (...wanted: string[]): Runnable =>
  (file) =>
    Promise.resolve(wanted.includes(file))

const posix = (value: string | undefined): SearchEnv => ({
  path: value,
  pathExt: undefined,
  windows: false,
  separator: ':',
})

const windows = (value: string, pathExt: string | undefined): SearchEnv => ({
  path: value,
  pathExt,
  windows: true,
  separator: ';',
})

describe('path lookup', () => {
  it('the first folder of the PATH answers', async () => {
    const first = path.posix.join('/opt/bin', command)
    assert.equal(
      await findOnPath(
        command,
        posix('/opt/bin:/usr/bin'),
        only(first, path.posix.join('/usr/bin', command)),
      ),
      first,
    )
  })

  it('a later folder answers when the earlier folders hold nothing', async () => {
    const third = path.posix.join('/home/dev/.local/bin', command)
    assert.equal(
      await findOnPath(command, posix('/opt/bin:/usr/bin:/home/dev/.local/bin'), only(third)),
      third,
    )
  })

  it('a PATH that holds no such command answers nothing', async () => {
    assert.equal(
      await findOnPath(command, posix('/opt/bin:/usr/bin'), () => Promise.resolve(false)),
      undefined,
    )
  })

  it('an empty PATH answers nothing', async () => {
    const answers = await Promise.all(
      [undefined, '', ':', '  '].map((value) =>
        findOnPath(command, posix(value), () => Promise.resolve(true)),
      ),
    )
    assert.deepEqual(answers, [undefined, undefined, undefined, undefined])
  })

  it('Windows finds a file that only PATHEXT names', async () => {
    const wanted = path.win32.join('C:\\tools', 'claude.CMD')
    assert.equal(
      await findOnPath(
        command,
        windows('C:\\windows;C:\\tools', '.COM;.EXE;.BAT;.CMD'),
        only(wanted, path.win32.join('C:\\tools', command)),
      ),
      wanted,
    )
  })

  it('an empty PATHEXT falls back to the default extensions', async () => {
    const wanted = path.win32.join('C:\\tools', 'claude.EXE')
    assert.deepEqual(pathExtensions(''), ['.COM', '.EXE', '.BAT', '.CMD'])
    assert.deepEqual(pathExtensions(undefined), DEFAULT_EXTENSIONS)
    assert.equal(await findOnPath(command, windows('C:\\tools', undefined), only(wanted)), wanted)
  })

  it('an extension without a point still names a file', () => {
    assert.deepEqual(pathExtensions('EXE; .CMD ;'), ['.EXE', '.CMD'])
  })

  it('the folder list drops an empty entry and trims the rest', () => {
    assert.deepEqual(pathEntries('/opt/bin: :/usr/bin:', ':'), ['/opt/bin', '/usr/bin'])
    assert.deepEqual(pathEntries(undefined, ':'), [])
  })

  it('only Windows adds an extension to the command', () => {
    assert.deepEqual(commandNames(command, false, '.EXE'), [command])
    assert.deepEqual(commandNames(command, true, '.EXE;.CMD'), ['claude.EXE', 'claude.CMD'])
  })

  it('a folder that no path can carry drops out of the search', async () => {
    const wanted = path.posix.join('/usr/bin', command)
    const asked: string[] = []
    assert.equal(
      await findOnPath(command, posix('/opt\0bin:/usr/bin'), (file) => {
        asked.push(file)
        return only(wanted)(file)
      }),
      wanted,
    )
    assert.deepEqual(asked, [wanted])
  })
})
