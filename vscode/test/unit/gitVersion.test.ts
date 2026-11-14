import assert from 'node:assert/strict'

import { gitProblem, isSupportedGit, parseGitVersion } from '../../src/git/gitVersion'

const answer = (stdout: string, exitCode = 0) => ({ exitCode, stdout, stderr: '' })

describe('git version', () => {
  it('reads the version of each platform build', () => {
    assert.deepEqual(parseGitVersion('git version 2.55.0.windows.3\n'), [2, 55, 0])
    assert.deepEqual(parseGitVersion('git version 2.39.5 (Apple Git-154)'), [2, 39, 5])
    assert.deepEqual(parseGitVersion('git version 2.24.1'), [2, 24, 1])
    assert.deepEqual(parseGitVersion('git version 3.0'), [3, 0, 0])
  })

  it('refuses text that is not a git version', () => {
    assert.equal(parseGitVersion(''), undefined)
    assert.equal(parseGitVersion('version 2.40.0'), undefined)
    assert.equal(parseGitVersion('hub version 2.14.2'), undefined)
  })

  it('accepts git 2.24 and later only', () => {
    assert.equal(isSupportedGit([2, 24, 0]), true)
    assert.equal(isSupportedGit([2, 55, 0]), true)
    assert.equal(isSupportedGit([3, 0, 0]), true)
    assert.equal(isSupportedGit([2, 23, 4]), false)
    assert.equal(isSupportedGit([1, 99, 0]), false)
  })

  it('gives a message for an old, an unknown, or a missing git', () => {
    assert.equal(gitProblem(answer('git version 2.24.0\n')), undefined)
    assert.match(gitProblem(answer('git version 2.20.1\n')) ?? '', /^Git 2\.20\.1 is too old\./u)
    assert.match(gitProblem(answer('something else')) ?? '', /could not read the git version/u)
    assert.match(gitProblem(answer('', -2)) ?? '', /could not run git/u)
  })
})
