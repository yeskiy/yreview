import assert from 'node:assert/strict'

import {
  type RevisionFacts,
  changeFacts,
  parseGitUriQuery,
  refKindOf,
  resolveDiffAnchor,
  revisionLabel,
} from '../../src/core/diffAnchor'

const facts = (value: RevisionFacts): RevisionFacts => ({
  ...value,
  afterPath: 'afterPath' in value ? value.afterPath : value.after?.path,
})

describe('diff anchor resolver', () => {
  it('the left side takes the before revision', () => {
    const anchor = resolveDiffAnchor(
      facts({
        before: { commit: '4f2c8b1', path: 'a.kt' },
        after: { commit: '9de1122', path: 'a.kt' },
      }),
      'left',
    )
    assert.deepEqual(anchor, { side: 'left', commit: '4f2c8b1', path: 'a.kt', dirty: false })
  })

  it('the right side takes the after revision', () => {
    const anchor = resolveDiffAnchor(
      facts({
        before: { commit: '4f2c8b1', path: 'a.kt' },
        after: { commit: '9de1122', path: 'a.kt' },
      }),
      'right',
    )
    assert.equal(anchor?.commit, '9de1122')
    assert.equal(anchor?.dirty, false)
  })

  it('a renamed file keeps the path of its own side', () => {
    const renamed = facts({
      before: { commit: '4f2c8b1', path: 'old.kt' },
      after: { commit: '9de1122', path: 'new.kt' },
    })
    assert.equal(resolveDiffAnchor(renamed, 'left')?.path, 'old.kt')
    assert.equal(resolveDiffAnchor(renamed, 'right')?.path, 'new.kt')
  })

  it('the working tree side falls back to head and is marked dirty', () => {
    const anchor = resolveDiffAnchor(
      facts({ before: { commit: '4f2c8b1', path: 'a.kt' }, head: '9de1122' }),
      'right',
    )
    assert.deepEqual(anchor, { side: 'right', commit: '9de1122', path: 'a.kt', dirty: true })
  })

  it('a new file has no left anchor', () => {
    assert.equal(
      resolveDiffAnchor(
        facts({ after: { commit: '9de1122', path: 'a.kt' }, head: '9de1122' }),
        'left',
      ),
      undefined,
    )
  })

  it('a file that git does not track yet anchors the right side at head', () => {
    assert.deepEqual(resolveDiffAnchor({ afterPath: 'new.kt', head: '9de1122' }, 'right'), {
      side: 'right',
      commit: '9de1122',
      path: 'new.kt',
      dirty: true,
    })
  })

  it('a file that git does not track yet still has no left anchor', () => {
    assert.equal(resolveDiffAnchor({ afterPath: 'new.kt', head: '9de1122' }, 'left'), undefined)
  })

  it('a diff with no revision at all has no anchor', () => {
    assert.equal(resolveDiffAnchor({}, 'left'), undefined)
    assert.equal(resolveDiffAnchor({}, 'right'), undefined)
  })
})

describe('change facts', () => {
  const root = 'E:/work/api'
  const head = '9de1122'
  const added = (file: string) => changeFacts({ after: { revision: '', file } }, head, root)

  it('a blank revision is the working tree', () => {
    assert.equal(
      changeFacts({ after: { revision: '  ', file: `${root}/a.kt` } }, head, root).after,
      undefined,
    )
  })

  it('an added file holds no revision pair on either side', () => {
    assert.equal(added(`${root}/new.kt`).before, undefined)
    assert.equal(added(`${root}/new.kt`).after, undefined)
  })

  it('an added file still names the path of the right side', () => {
    assert.equal(added(`${root}/new.kt`).afterPath, 'new.kt')
  })

  it('a file outside the repository names no path', () => {
    assert.equal(added('E:/other/new.kt').afterPath, undefined)
  })

  it('the diff of an added file takes a comment on the right side', () => {
    assert.deepEqual(resolveDiffAnchor(added(`${root}/new.kt`), 'right'), {
      side: 'right',
      commit: head,
      path: 'new.kt',
      dirty: true,
    })
  })
})

describe('git URI of a diff side', () => {
  it('reads the path and the ref of the built-in git extension', () => {
    assert.deepEqual(parseGitUriQuery('{"path":"c:\\\\w\\\\a.txt","ref":"HEAD"}'), {
      path: 'c:\\w\\a.txt',
      ref: 'HEAD',
    })
    assert.deepEqual(parseGitUriQuery('{"path":"/w/a.txt","ref":"","submoduleOf":"/w"}'), {
      path: '/w/a.txt',
      ref: '',
    })
  })

  it('refuses a query that is not the git extension shape', () => {
    ;[
      '',
      'not json',
      '[]',
      'null',
      '{"path":"/w/a.txt"}',
      '{"path":"","ref":"HEAD"}',
      '{"path":1,"ref":"HEAD"}',
      '{"path":"/w/a\\u0000b","ref":"HEAD"}',
      `{"path":"/w/a.txt","ref":"${'x'.repeat(5000)}"}`,
    ].forEach((query) => assert.equal(parseGitUriQuery(query), undefined, query))
  })

  it('names the kind of each ref', () => {
    assert.deepEqual(refKindOf(''), { kind: 'index' })
    assert.deepEqual(refKindOf('~'), { kind: 'indexOrHead' })
    assert.deepEqual(refKindOf('HEAD'), { kind: 'commit', rev: 'HEAD' })
    assert.deepEqual(refKindOf('HEAD~1'), { kind: 'commit', rev: 'HEAD~1' })
    assert.deepEqual(refKindOf('4f2c8b1^'), { kind: 'commit', rev: '4f2c8b1^' })
    assert.deepEqual(refKindOf('@{-1}'), { kind: 'commit', rev: '@{-1}' })
  })

  it('gives no commit for a merge stage, an option, a path or a range', () => {
    ;[
      '~1',
      '~2',
      '~3',
      '-p',
      '--output=x',
      'HEAD:a.txt',
      'HEAD..main',
      'a b',
      `a${'b'.repeat(300)}`,
    ].forEach((ref) => assert.deepEqual(refKindOf(ref), { kind: 'none' }, ref))
  })

  it('labels a revision as CommentText.diffHeader does', () => {
    assert.equal(revisionLabel('4f2c8b1d0e', false), '@4f2c8b1')
    assert.equal(revisionLabel('4f2c8b1d0e', true), '@4f2c8b1 (working tree)')
    assert.equal(revisionLabel('worktree', false), '@working tree')
  })
})
