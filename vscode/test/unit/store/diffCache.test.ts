import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import path from 'node:path'

import { type GitRunner, ProcessGitRunner } from '../../../src/git/runner'
import { diffsOf, forgetDiffs } from '../../../src/store/diffCache'
import { git, makeRepo, removeDir } from '../../fixtures/scratch'

const counting = (dir: string): { runner: GitRunner; calls: string[][] } => {
  const inner = new ProcessGitRunner(dir)
  const calls: string[][] = []
  return {
    calls,
    runner: {
      run: (args, signal) => {
        calls.push([...args])
        return inner.run(args, signal)
      },
    },
  }
}

describe('diff cache', function cache() {
  this.timeout(60_000)
  const dirs: string[] = []
  beforeEach(forgetDiffs)
  afterEach(forgetDiffs)
  after(() => dirs.forEach(removeDir))

  const repo = (): string => {
    const dir = makeRepo()
    dirs.push(dir)
    return dir
  }
  const commitFile = (dir: string, file: string, text: string): string => {
    writeFileSync(path.join(dir, file), text)
    git(dir, 'add', file)
    git(dir, 'commit', '-q', '-m', `write ${file}`)
    return git(dir, 'rev-parse', 'HEAD')
  }

  it('reads every path of one commit with one call, and a second ask reads none', async () => {
    const dir = repo()
    commitFile(dir, 'b.txt', 'x\n')
    const old = commitFile(dir, 'a.txt', '1\n2\n')
    const head = commitFile(dir, 'c.txt', 'y\n')
    writeFileSync(path.join(dir, 'a.txt'), '0\n1\n2\n')
    const { runner, calls } = counting(dir)
    const first = await diffsOf(runner, dir, head, old, ['a.txt', 'b.txt'])
    const second = await diffsOf(runner, dir, head, old, ['a.txt', 'b.txt'])
    assert.equal(calls.length, 1)
    assert.deepEqual(first?.get('a.txt')?.hunks, [
      { oldStart: 0, oldCount: 0, newStart: 1, newCount: 1, removed: [] },
    ])
    assert.equal(first?.has('b.txt'), true)
    assert.equal(first?.get('b.txt'), undefined)
    assert.deepEqual(second, first)
  })

  it('reads the diff again after a file write', async () => {
    const dir = repo()
    const old = commitFile(dir, 'a.txt', '1\n')
    const { runner, calls } = counting(dir)
    await diffsOf(runner, dir, old, old, ['a.txt'])
    writeFileSync(path.join(dir, 'a.txt'), '1\n2\n3\n')
    const again = await diffsOf(runner, dir, old, old, ['a.txt'])
    assert.equal(calls.length, 2)
    assert.equal(again?.get('a.txt')?.hunks[0]?.newCount, 2)
  })

  it('gives undefined for an unknown commit and asks git once until HEAD moves', async () => {
    const dir = repo()
    const head = commitFile(dir, 'a.txt', '1\n')
    const { runner, calls } = counting(dir)
    const unknown = '0'.repeat(40)
    assert.equal(await diffsOf(runner, dir, head, unknown, ['a.txt']), undefined)
    assert.equal(await diffsOf(runner, dir, head, unknown, ['a.txt']), undefined)
    assert.equal(calls.length, 1)
  })

  it('starts no git for a value that is not an object name', async () => {
    const dir = repo()
    const head = commitFile(dir, 'a.txt', '1\n')
    const { runner, calls } = counting(dir)
    assert.equal(await diffsOf(runner, dir, head, '--output=x', ['a.txt']), undefined)
    assert.equal(calls.length, 0)
  })
})
