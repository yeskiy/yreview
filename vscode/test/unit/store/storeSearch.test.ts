import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { gitCalls, ProcessGitRunner } from '../../../src/git/runner'
import { childStores } from '../../../src/store/storeSearch'
import { git, makeRepo, removeDir } from '../../fixtures/scratch'

const LOG = path.join('.y-review', 'notes', 'refs-notes-y-review-local', 'worktree.jsonl')

const store = (dir: string, folder: string): void => {
  const file = path.join(dir, folder, LOG)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, '{}\n')
}

/** A repository with one commit and every row of the search table. */
const tableRepo = (): string => {
  const dir = makeRepo()
  store(dir, '.')
  store(dir, path.join('a', 'b'))
  store(dir, 'ignored')
  store(dir, 'c')
  store(dir, path.join('node_modules', 'x'))
  store(dir, 'tracked')
  git(dir, 'add', path.join('tracked', LOG))
  git(dir, 'commit', '-q', '-m', 'tracked store')
  mkdirSync(path.join(dir, 'nested'))
  git(path.join(dir, 'nested'), 'init', '-q', '-b', 'main')
  store(dir, 'nested')
  writeFileSync(path.join(dir, '.gitignore'), 'ignored/\n')
  writeFileSync(path.join(dir, 'c', '.gitignore'), '.y-review/\n')
  return dir
}

const counted = async <T>(work: () => Promise<T>): Promise<{ value: T; calls: number }> => {
  const before = gitCalls()
  const value = await work()
  return { value, calls: gitCalls() - before }
}

describe('child store search', function search() {
  this.timeout(120_000)
  const dirs: string[] = []
  after(() => dirs.forEach(removeDir))

  const made = (dir: string): string => {
    dirs.push(dir)
    return dir
  }

  const expected = (dir: string): readonly string[] =>
    [dir, path.join(dir, 'a', 'b'), path.join(dir, 'c')].sort()

  it('finds each untracked store root and leaves out ignored, nested, node_modules and tracked stores', async () => {
    const dir = made(tableRepo())
    assert.deepEqual(await childStores(new ProcessGitRunner(dir), dir), expected(dir))
  })

  it('runs exactly 2 git processes', async () => {
    const dir = made(tableRepo())
    assert.equal((await counted(() => childStores(new ProcessGitRunner(dir), dir))).calls, 2)
  })

  it('runs 2 git processes and finds the same roots with 3,000 ignored files', async () => {
    const dir = made(tableRepo())
    mkdirSync(path.join(dir, 'build'))
    Array.from({ length: 3000 }, (_, index) =>
      writeFileSync(path.join(dir, 'build', `f${index}.o`), ''),
    )
    writeFileSync(path.join(dir, '.gitignore'), 'ignored/\nbuild/\n')
    const { value, calls } = await counted(() => childStores(new ProcessGitRunner(dir), dir))
    assert.deepEqual({ value, calls }, { value: expected(dir), calls: 2 })
  })

  it('keeps an ignored .y-review entry only when it holds a notes folder', async () => {
    const dir = made(makeRepo())
    mkdirSync(path.join(dir, 'd', '.y-review'), { recursive: true })
    writeFileSync(path.join(dir, 'd', '.y-review', 'other.txt'), '')
    writeFileSync(path.join(dir, '.gitignore'), '.y-review/\n')
    store(dir, 'e')
    assert.deepEqual(await childStores(new ProcessGitRunner(dir), dir), [path.join(dir, 'e')])
  })

  it('gives undefined when git does not answer', async () => {
    const dir = made(makeRepo())
    const silent = { run: () => Promise.resolve({ exitCode: 128, stdout: '', stderr: 'fatal' }) }
    assert.equal(await childStores(silent, dir), undefined)
  })

  it('gives no roots outside a store', async () => {
    const dir = made(makeRepo())
    assert.deepEqual(await childStores(new ProcessGitRunner(dir), dir), [])
  })
})
