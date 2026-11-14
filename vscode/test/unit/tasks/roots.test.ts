import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

import { ProcessGitRunner } from '../../../src/git/runner'
import { basePathOf, gitRoot, ownsFile, projectPath, uniqueRoots } from '../../../src/tasks/roots'
import { git, makeRepo, removeDir, scratchDir, shortForm } from '../../fixtures/scratch'

const slash = (value: string): string => value.replaceAll('\\', '/')

describe('roots', function roots() {
  this.timeout(120_000)
  const dirs: string[] = []
  const scratch = (): string => {
    const dir = scratchDir()
    dirs.push(dir)
    return dir
  }

  after(() => dirs.forEach(removeDir))

  it('gives the long real path of a folder with /', async () => {
    const dir = scratch()
    assert.equal(await projectPath(dir), slash(dir))
  })

  it('gives the long form of an 8.3 short folder', async function shortFolder() {
    const dir = scratch()
    const short = shortForm(dir)
    if (short === undefined) this.skip()
    assert.equal(await projectPath(short), slash(dir))
  })

  it('gives the own path of a missing folder', async () => {
    const gone = path.join(scratch(), 'gone')
    assert.equal(await projectPath(gone), slash(gone))
  })

  it('gives the root of a folder inside a repository', async () => {
    const repo = makeRepo(scratch())
    mkdirSync(path.join(repo, 'src'), { recursive: true })
    assert.equal(
      await gitRoot(new ProcessGitRunner(path.join(repo, 'src'))),
      git(repo, 'rev-parse', '--show-toplevel'),
    )
  })

  it('gives undefined for a folder in no repository', async () => {
    assert.equal(await gitRoot(new ProcessGitRunner(scratch())), undefined)
  })

  it('gives the innermost folder that holds the root', () => {
    assert.equal(basePathOf(['E:/w', 'E:/w/app'])('E:/w/app/lib'), 'E:/w/app')
  })

  it('gives no folder for a root outside every folder', () => {
    assert.equal(basePathOf(['E:/w'])('E:/other'), undefined)
  })

  it('does not take a name prefix as a folder', () => {
    assert.equal(basePathOf(['E:/work'])('E:/workshop'), undefined)
  })

  it('leaves the file of an inner root to the inner root', () => {
    assert.equal(ownsFile('E:/r', 'E:/r/in/a.ts', ['E:/r', 'E:/r/in']), false)
    assert.equal(ownsFile('E:/r/in', 'E:/r/in/a.ts', ['E:/r', 'E:/r/in']), true)
  })

  it('gives a root its own file', () => {
    assert.equal(ownsFile('E:/r', 'E:/r/a.ts', ['E:/r']), true)
  })

  it('gives the roots once each, in order, with no empty value', () => {
    assert.deepEqual(uniqueRoots(['b', undefined, 'a', 'b', '']), ['a', 'b'])
  })
})
