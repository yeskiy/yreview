import assert from 'node:assert/strict'
import path from 'node:path'

import { folderRoot, ownsFile, planAnchor, relativeTo, slashPath } from '../../src/core/anchor'

describe('anchor rules', () => {
  const base = 'E:/Projects/site'

  it('a file under the project directory uses the project directory', () => {
    assert.equal(folderRoot(`${base}/CLAUDE.md`, base, [`${base}/app`]), base)
  })

  it('a deep file under the project directory still uses the project directory', () => {
    assert.equal(folderRoot(`${base}/docs/reviews/one.md`, base, []), base)
  })

  it('a file outside the project directory uses the innermost content root', () => {
    assert.equal(
      folderRoot('E:/Other/lib/inner/a.kt', base, ['E:/Other/lib', 'E:/Other/lib/inner']),
      'E:/Other/lib/inner',
    )
  })

  it('a file outside every root has no place', () => {
    assert.equal(folderRoot('E:/Elsewhere/a.kt', base, [`${base}/app`]), undefined)
  })

  it('a missing project directory falls through to the content roots', () => {
    assert.equal(folderRoot(`${base}/app/a.kt`, undefined, [`${base}/app`]), `${base}/app`)
  })

  it('a sibling folder with a longer name is not inside the root', () => {
    assert.equal(folderRoot('E:/Projects/site-two/a.kt', base, []), undefined)
  })

  it('the relative path drops the root and the slash', () => {
    assert.equal(relativeTo(`${base}/docs/one.md`, base), 'docs/one.md')
  })

  it('the relative path of a file outside the root is undefined', () => {
    assert.equal(relativeTo('E:/Elsewhere/a.kt', base), undefined)
  })

  it('the root itself has no relative path', () => {
    assert.equal(relativeTo(base, base), undefined)
    assert.equal(relativeTo(`${base}/`, base), undefined)
  })

  it('the nearest repository owns a file of a nested repository', () => {
    const roots = [base, `${base}/inner`]
    assert.equal(ownsFile(base, `${base}/inner/x.kt`, roots), false)
    assert.equal(ownsFile(`${base}/inner`, `${base}/inner/x.kt`, roots), true)
  })

  it('the only repository that holds a file owns it', () => {
    assert.equal(ownsFile(base, `${base}/src/Main.kt`, [base, `${base}/inner`]), true)
  })

  it('a repository that does not hold the file owns nothing', () => {
    assert.equal(ownsFile(base, 'E:/Elsewhere/a.kt', [base]), false)
  })

  it('a sibling root with a longer name takes no file', () => {
    assert.equal(ownsFile(base, `${base}/a.kt`, [base, `${base}-two`]), true)
  })

  it('with no project directory the longest workspace folder wins', () => {
    assert.equal(folderRoot('E:/w/inner/a.md', undefined, ['E:/w', 'E:/w/inner']), 'E:/w/inner')
  })

  it('a native path gets the slash separator', () => {
    assert.equal(slashPath(['E:', 'w', 'a.md'].join(path.sep)), 'E:/w/a.md')
  })
})

describe('anchor plan', () => {
  const project = 'E:/Projects/site'
  const head = '9f0e1d2c3b4a5968778695a4b3c2d1e0f9a8b706'
  const plan = (
    filePath: string,
    options: { repositoryRoot?: string; head?: string; contentRoots?: readonly string[] } = {},
  ) =>
    planAnchor(
      filePath,
      options.repositoryRoot,
      options.head,
      () => project,
      () => options.contentRoots ?? [],
    )

  it('a file of a repository goes to the notes of that repository', () => {
    assert.deepEqual(
      plan(`${project}/api/src/Main.kt`, { repositoryRoot: `${project}/api`, head }),
      { kind: 'git', root: `${project}/api`, commit: head, path: 'src/Main.kt' },
    )
  })

  it('a file of an inner repository never reaches the folder of a parent', () => {
    assert.deepEqual(
      plan(`${project}/api/src/Main.kt`, {
        repositoryRoot: `${project}/api`,
        head,
        contentRoots: [project, `${project}/api`],
      }),
      { kind: 'git', root: `${project}/api`, commit: head, path: 'src/Main.kt' },
    )
  })

  it('a repository without a commit refuses and takes no folder', () => {
    assert.deepEqual(
      plan(`${project}/api/src/Main.kt`, {
        repositoryRoot: `${project}/api`,
        contentRoots: [project],
      }),
      { kind: 'noCommit' },
    )
  })

  it('a file that no repository holds goes to the folder store', () => {
    assert.deepEqual(plan(`${project}/notes/one.md`), {
      kind: 'folder',
      root: project,
      path: 'notes/one.md',
    })
  })

  it('a file outside every root has no place', () => {
    assert.deepEqual(plan('E:/Elsewhere/a.kt'), { kind: 'noPlace' })
  })

  it('the root of a repository is not a file of that repository', () => {
    assert.deepEqual(plan(`${project}/api`, { repositoryRoot: `${project}/api`, head }), {
      kind: 'noPlace',
    })
  })

  it('a repository does not read the project roots', () => {
    const reads: number[] = []
    planAnchor(
      `${project}/api/src/Main.kt`,
      `${project}/api`,
      head,
      () => project,
      () => {
        reads.push(1)
        return [project]
      },
    )
    assert.deepEqual(reads, [], 'the rule read the content roots of the project')
  })
})
