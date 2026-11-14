import assert from 'node:assert/strict'

import { sha256Hex } from '../../src/core/digest'
import {
  discoveryFileName,
  isRelativeUnder,
  isUnder,
  resolvePath,
  windowFolderName,
} from '../../src/core/paths'

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
