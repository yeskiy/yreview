import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import path from 'node:path'

import { type GitRunner, ProcessGitRunner } from '../../../src/git/runner'
import { changeFiles, parseStatus } from '../../../src/tasks/changeScan'
import { git, makeRepo, removeDir } from '../../fixtures/scratch'

const NUL = String.fromCharCode(0)

describe('parseStatus', () => {
  const cases: readonly (readonly [string, string, readonly string[]])[] = [
    ['a modified file', ` M src/a.txt${NUL}`, ['src/a.txt']],
    ['a staged file', `M  src/a.txt${NUL}`, ['src/a.txt']],
    ['an untracked file', `?? new.txt${NUL}`, ['new.txt']],
    ['a deleted file drops out', ` D gone.txt${NUL}D  old.txt${NUL}`, []],
    ['an added and then deleted file drops out', `AD tmp.txt${NUL}`, []],
    ['a path with a space', ` M a b.txt${NUL}`, ['a b.txt']],
    ['an empty output', '', []],
  ]
  cases.forEach(([name, output, paths]) =>
    it(name, () => assert.deepEqual(parseStatus(output), paths)),
  )
})

describe('changeFiles', function changeScan() {
  this.timeout(120_000)
  const dir = makeRepo()
  const root = dir.replaceAll('\\', '/')

  after(() => removeDir(dir))

  it('gives the changed and the untracked files, and drops a deleted file', async () => {
    writeFileSync(path.join(dir, 'src', 'a.txt'), 'changed\n')
    writeFileSync(path.join(dir, 'src', 'new.txt'), 'new\n')
    assert.deepEqual([...((await changeFiles(new ProcessGitRunner(dir), root)) ?? [])].sort(), [
      `${root}/src/a.txt`,
      `${root}/src/new.txt`,
    ])
    git(dir, 'rm', '-q', '-f', 'src/a.txt')
    assert.deepEqual(await changeFiles(new ProcessGitRunner(dir), root), [`${root}/src/new.txt`])
  })

  it('gives undefined when git fails', async () => {
    const failing: GitRunner = {
      run: () => Promise.resolve({ exitCode: 128, stdout: '', stderr: 'x' }),
    }
    assert.equal(await changeFiles(failing, root), undefined)
  })
})
