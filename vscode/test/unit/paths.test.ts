import assert from 'node:assert/strict'
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { sha256Hex } from '../../src/core/digest'
import {
  discoveryFileName,
  isRelativeUnder,
  isUnder,
  resolvePath,
  windowFolderName,
  containedPath,
  normalizeRelative,
  realOf,
} from '../../src/core/paths'
import { removeDir, scratchDir, shortForm } from '../fixtures/scratch'

describe('task path', () => {
  const root = 'E:/work/demo-repo'

  it('a file of the repository stands under the root', () => {
    assert.ok(isUnder(root, `${root}/src/main/Parser.kt`))
    assert.ok(isUnder(root, `${root}/README.md`))
  })

  it('a path that climbs out of the root stands outside', () => {
    assert.equal(isUnder(root, `${root}/../secret.txt`), false)
    assert.equal(isUnder(root, `${root}/../../../../Windows/win.ini`), false)
    assert.equal(isUnder(root, `${root}/src/../../secret.txt`), false)
  })

  it('a climb that comes back stays under the root', () => {
    assert.ok(isUnder(root, `${root}/src/../src/Parser.kt`))
  })

  it('the root itself is no file of a task', () => {
    assert.equal(isUnder(root, root), false)
    assert.equal(isUnder(root, `${root}/`), false)
  })

  it('a path of another disk stands outside', () => {
    assert.equal(isUnder(root, 'C:/Windows/win.ini'), false)
    assert.equal(isUnder(root, '/etc/passwd'), false)
  })

  it('a name that only starts like the root stands outside', () => {
    assert.equal(isUnder(root, 'E:/work/demo-repo-other/Parser.kt'), false)
  })

  it('a root that names nothing holds no file', () => {
    assert.equal(isUnder('', 'E:/work/demo-repo/Parser.kt'), false)
  })

  it('both separators name one path', () => {
    assert.ok(isUnder('E:\\work\\demo-repo', 'E:\\work\\demo-repo\\src\\Parser.kt'))
  })

  it('a posix path keeps the separator it starts with', () => {
    assert.equal(resolvePath('/home/alice/./repo/'), '/home/alice/repo')
    assert.ok(isUnder('/home/alice/repo', '/home/alice/repo/src/Parser.kt'))
    assert.equal(isUnder('/home/alice/repo', '/home/alice/repo/../secret.txt'), false)
  })

  it('a climb over the top of a path leaves nothing', () => {
    assert.equal(resolvePath('E:/../..'), '')
    assert.equal(resolvePath('..'), '')
    assert.equal(isUnder('E:/../..', 'E:/work/demo-repo/Parser.kt'), false)
  })

  it('a note path that climbs out of the repository is refused', () => {
    assert.equal(isRelativeUnder(root, '../../../../Users/victim/.ssh/id_rsa'), false)
    assert.equal(isRelativeUnder(root, 'src\\..\\..\\secret.txt'), false)
  })

  it('an absolute note path is refused', () => {
    assert.equal(isRelativeUnder(root, 'C:/Users/victim/.ssh/id_rsa'), false)
    assert.equal(isRelativeUnder(root, '/etc/passwd'), false)
    assert.equal(isRelativeUnder(root, '\\\\server\\share\\secret.txt'), false)
  })

  it('a relative note path inside the repository is accepted', () => {
    assert.ok(isRelativeUnder(root, 'src/main/Parser.kt'))
    assert.ok(isRelativeUnder(root, 'src/../README.md'))
  })
})

describe('folder names', () => {
  it('replaces a lone surrogate with one character and hashes it as a question mark', () => {
    assert.equal(discoveryFileName('a\ud800b'), `a-b-${sha256Hex('a?b').slice(0, 16)}.json`)
    assert.equal(windowFolderName('/x/a\udc00b'), `a-b-${sha256Hex('/x/a?b').slice(0, 8)}`)
  })
})

describe('relative path from an agent or a note', () => {
  it('a plain relative path passes', () => {
    assert.equal(normalizeRelative('src/main/a.kt'), 'src/main/a.kt')
  })

  it('a backslash becomes a forward slash', () => {
    assert.equal(normalizeRelative('src\\main\\a.kt'), 'src/main/a.kt')
  })

  it('a leading dot segment is dropped', () => {
    assert.equal(normalizeRelative('./src/./a.kt'), 'src/a.kt')
  })

  it('an inner parent segment is folded', () => {
    assert.equal(normalizeRelative('src/main/../a.kt'), 'src/a.kt')
  })

  it('a path that leaves the project is rejected', () => {
    assert.equal(normalizeRelative('../secrets.txt'), undefined)
    assert.equal(normalizeRelative('src/../../secrets.txt'), undefined)
  })

  it('an absolute path is rejected', () => {
    assert.equal(normalizeRelative('/etc/passwd'), undefined)
    assert.equal(normalizeRelative('C:\\Windows\\win.ini'), undefined)
    assert.equal(normalizeRelative('\\\\server\\share\\file'), undefined)
  })

  it('an empty path is rejected', () => {
    assert.equal(normalizeRelative('   '), undefined)
    assert.equal(normalizeRelative('.'), undefined)
  })
})

describe('contained path', () => {
  const dirs: string[] = []
  after(() => dirs.forEach(removeDir))
  const dir = (): string => {
    const made = scratchDir()
    dirs.push(made)
    return made
  }

  it('gives the absolute path of a file under the root', async () => {
    const root = dir()
    mkdirSync(path.join(root, 'src'))
    writeFileSync(path.join(root, 'src', 'a.txt'), 'x')
    assert.equal(await containedPath(root, 'src/a.txt'), path.join(root, 'src', 'a.txt'))
  })

  it('gives the path of a file that does not exist yet', async () => {
    const root = dir()
    assert.equal(await containedPath(root, 'gone/a.txt'), path.join(root, 'gone', 'a.txt'))
  })

  it('refuses NUL, a climb out, an absolute path and the root itself', async () => {
    const root = dir()
    await Promise.all(
      [
        'a\u0000b',
        '../x.txt',
        'src/../../x.txt',
        '/etc/passwd',
        'C:/Windows/win.ini',
        'src/..',
      ].map(async (relative) =>
        assert.equal(await containedPath(root, relative), undefined, relative),
      ),
    )
  })

  it('refuses a path whose link leaves the root', async () => {
    const root = dir()
    const outside = dir()
    writeFileSync(path.join(outside, 'secret.txt'), 'x')
    // A junction needs no admin right on Windows, and POSIX takes a plain link.
    symlinkSync(outside, path.join(root, 'link'), process.platform === 'win32' ? 'junction' : 'dir')
    assert.equal(await containedPath(root, 'link/secret.txt'), undefined)
  })

  it('accepts a link that stays inside the root', async () => {
    const root = dir()
    mkdirSync(path.join(root, 'real'))
    symlinkSync(
      path.join(root, 'real'),
      path.join(root, 'link'),
      process.platform === 'win32' ? 'junction' : 'dir',
    )
    assert.equal(await containedPath(root, 'link/a.txt'), path.join(root, 'link', 'a.txt'))
  })

  it('gives the long real path of a missing file under a short folder name', async function shortName() {
    const root = dir()
    const short = shortForm(root)
    // 8.3 names exist only on Windows volumes that make them.
    if (short === undefined) this.skip()
    assert.equal(await realOf(path.join(short, 'gone', 'a.txt')), path.join(root, 'gone', 'a.txt'))
  })
})
