import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import path from 'node:path'

import { slashPath } from '../../../src/core/anchor'
import { NotesWriteError } from '../../../src/git/errors'
import { commitOf, diffAnchorOf, hasFile, isStaged } from '../../../src/git/revision'
import { ProcessGitRunner } from '../../../src/git/runner'
import { git, makeRepo, removeDir, scratchDir } from '../../fixtures/scratch'

describe('revision of a diff side', function revision() {
  this.timeout(240_000)
  const repo = makeRepo()
  const root = slashPath(repo)
  const runner = new ProcessGitRunner(repo)
  const file = (name: string): string => `${root}/src/${name}`
  const first = git(repo, 'rev-parse', 'HEAD')
  writeFileSync(path.join(repo, 'src', 'a.txt'), 'one\nTWO\nthree\n')
  writeFileSync(path.join(repo, 'src', 'b.txt'), 'new\n')
  git(repo, 'add', '.')
  git(repo, 'commit', '-q', '-m', 'second')
  const second = git(repo, 'rev-parse', 'HEAD')
  after(() => removeDir(repo))

  it('names the commit of a revision and nothing for an unknown one', async () => {
    assert.equal(await commitOf(runner, 'HEAD'), second)
    assert.equal(await commitOf(runner, 'HEAD~1'), first)
    assert.equal(await commitOf(runner, 'no-such-branch'), undefined)
  })

  it('stops when git does not start', async () => {
    await assert.rejects(
      commitOf(new ProcessGitRunner(repo, 'no-such-git-yreview'), 'HEAD'),
      NotesWriteError,
    )
  })

  it('tells whether a commit holds a file', async () => {
    assert.equal(await hasFile(runner, second, 'src/b.txt'), true)
    assert.equal(await hasFile(runner, first, 'src/b.txt'), false)
  })

  it('the left side of a commit diff anchors at the parent', async () => {
    assert.deepEqual(await diffAnchorOf(runner, root, file('a.txt'), 'HEAD~1'), {
      side: 'left',
      commit: first,
      path: 'src/a.txt',
      dirty: false,
    })
  })

  it('a side with a full commit hash anchors at that commit', async () => {
    assert.equal((await diffAnchorOf(runner, root, file('a.txt'), first))?.commit, first)
  })

  it('a new file has no anchor on the side of its parent', async () => {
    assert.equal(await diffAnchorOf(runner, root, file('b.txt'), 'HEAD~1'), undefined)
  })

  it('the ~ side with no staged change anchors at HEAD and is clean', async () => {
    assert.deepEqual(await diffAnchorOf(runner, root, file('a.txt'), '~'), {
      side: 'left',
      commit: second,
      path: 'src/a.txt',
      dirty: false,
    })
  })

  it('a staged change makes the ~ side and the index side dirty at HEAD', async () => {
    writeFileSync(path.join(repo, 'src', 'a.txt'), 'staged\n')
    git(repo, 'add', 'src/a.txt')
    try {
      assert.equal(await isStaged(runner, 'src/a.txt'), true)
      assert.deepEqual(await diffAnchorOf(runner, root, file('a.txt'), '~'), {
        side: 'right',
        commit: second,
        path: 'src/a.txt',
        dirty: true,
      })
      assert.equal((await diffAnchorOf(runner, root, file('a.txt'), ''))?.dirty, true)
    } finally {
      git(repo, 'reset', '-q', '--hard', 'HEAD')
    }
  })

  it('a pathspec pattern in a file name stays a plain name', async () => {
    writeFileSync(path.join(repo, 'src', 'a.txt'), 'staged\n')
    git(repo, 'add', 'src/a.txt')
    try {
      assert.equal(await isStaged(runner, 'src/*.txt'), false)
    } finally {
      git(repo, 'reset', '-q', '--hard', 'HEAD')
    }
  })

  it('a file that git does not track yet anchors the index side at HEAD', async () => {
    writeFileSync(path.join(repo, 'src', 'd.txt'), 'untracked\n')
    try {
      assert.deepEqual(await diffAnchorOf(runner, root, file('d.txt'), ''), {
        side: 'right',
        commit: second,
        path: 'src/d.txt',
        dirty: true,
      })
    } finally {
      removeDir(path.join(repo, 'src', 'd.txt'))
    }
  })

  it('a merge stage, an option, a path or a range gives no anchor', async () => {
    await Promise.all(
      ['~1', '~3', '-p', '--output=x', 'HEAD:src/a.txt', 'HEAD..main'].map(async (ref) =>
        assert.equal(await diffAnchorOf(runner, root, file('a.txt'), ref), undefined, ref),
      ),
    )
  })

  it('a file outside the root gives no anchor', async () => {
    assert.equal(await diffAnchorOf(runner, root, 'E:/elsewhere/a.txt', 'HEAD'), undefined)
  })

  it('a repository with no commit gives no anchor', async () => {
    const empty = scratchDir()
    try {
      git(empty, 'init', '-q')
      writeFileSync(path.join(empty, 'a.txt'), 'x')
      const bare = new ProcessGitRunner(empty)
      assert.equal(
        await diffAnchorOf(bare, slashPath(empty), `${slashPath(empty)}/a.txt`, 'HEAD'),
        undefined,
      )
      assert.equal(
        await diffAnchorOf(bare, slashPath(empty), `${slashPath(empty)}/a.txt`, ''),
        undefined,
      )
    } finally {
      removeDir(empty)
    }
  })
})
