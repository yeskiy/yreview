import assert from 'node:assert/strict'
import path from 'node:path'

import { gitDirOf, reviewFolderOf } from '../../../src/git/gitDir'
import { ProcessGitRunner } from '../../../src/git/runner'
import { git, makeRepo, removeDir, scratchDir } from '../../fixtures/scratch'

describe('git directory', function gitDir() {
  this.timeout(120_000)
  const repo = makeRepo()
  const plain = scratchDir()
  const worktree = path.join(scratchDir(), 'side')
  after(() => [repo, plain, path.dirname(worktree)].forEach(removeDir))

  it('finds the git directory of a plain repository', async () => {
    assert.equal(await gitDirOf(new ProcessGitRunner(repo)), path.join(repo, '.git'))
  })

  it('finds the git directory of a worktree', async () => {
    git(repo, 'worktree', 'add', '-q', '-b', 'side', worktree)
    assert.equal(
      await gitDirOf(new ProcessGitRunner(worktree)),
      path.join(repo, '.git', 'worktrees', 'side'),
    )
  })

  it('gives nothing outside a repository', async () => {
    assert.equal(await gitDirOf(new ProcessGitRunner(plain)), undefined)
  })

  it('names the review folder inside the git directory', async () => {
    assert.equal(
      await reviewFolderOf(new ProcessGitRunner(repo)),
      path.join(repo, '.git', 'y-review'),
    )
  })
})
