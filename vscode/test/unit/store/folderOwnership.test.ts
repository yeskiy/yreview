import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import {
  type GitRunner,
  ProcessGitRunner,
  TIMED_OUT,
  TOO_MUCH_OUTPUT,
} from '../../../src/git/runner'
import { FOLDER, NOTES, SUFFIX } from '../../../src/store/folderNotes'
import { isTracked, mayMigrate } from '../../../src/store/folderOwnership'
import { git, makeRepo, removeDir, scratchDir } from '../../fixtures/scratch'

describe('folder ownership', function ownership() {
  this.timeout(120_000)
  const dirs: string[] = []
  after(() => dirs.forEach(removeDir))
  const repo = (): string => {
    const dir = makeRepo()
    dirs.push(dir)
    return dir
  }
  const record = (dir: string, folder: string): void => {
    mkdirSync(path.join(dir, folder, NOTES), { recursive: true })
    writeFileSync(
      path.join(dir, folder, NOTES, `refs-notes-devtools-discuss${SUFFIX}`),
      '{"id":"one"}\n',
    )
  }

  it('a folder that git tracks is refused', async () => {
    const dir = repo()
    record(dir, FOLDER)
    git(dir, 'add', '-A')
    git(dir, 'commit', '-q', '-m', 'add the folder')
    assert.equal(await isTracked(new ProcessGitRunner(dir)), true)
    assert.equal(await mayMigrate(new ProcessGitRunner(dir)), false)
  })

  it('a folder that git does not track is allowed', async () => {
    const dir = repo()
    record(dir, FOLDER)
    assert.equal(await isTracked(new ProcessGitRunner(dir)), false)
    assert.equal(await mayMigrate(new ProcessGitRunner(dir)), true)
  })

  it('a folder in no repository at all is allowed', async () => {
    const dir = scratchDir()
    dirs.push(dir)
    mkdirSync(path.join(dir, FOLDER))
    assert.equal(await isTracked(new ProcessGitRunner(dir)), false)
    assert.equal(await mayMigrate(new ProcessGitRunner(dir)), true)
  })

  it('the answer names this folder alone, and no path a pattern would reach', async () => {
    const dir = repo()
    const name = '[a-y]-review'
    writeFileSync(path.join(dir, 'x-review'), 'one')
    git(dir, 'add', 'x-review')
    git(dir, 'commit', '-q', '-m', 'x')
    record(dir, name)
    assert.equal(await isTracked(new ProcessGitRunner(dir), name), false)
    assert.equal(await mayMigrate(new ProcessGitRunner(dir), name), true)
  })

  it('a git that does not start refuses the migration', async () => {
    const dir = scratchDir()
    dirs.push(dir)
    mkdirSync(path.join(dir, FOLDER))
    assert.equal(await mayMigrate(new ProcessGitRunner(dir, 'y-review-no-such-git')), false)
  })

  it('an answer that git did not give refuses the migration', async () => {
    await Promise.all(
      [TOO_MUCH_OUTPUT, TIMED_OUT].map(async (exitCode) => {
        const runner: GitRunner = {
          run: () =>
            Promise.resolve({ exitCode, stdout: '', stderr: 'the runner refused the answer' }),
        }
        assert.equal(
          await mayMigrate(runner),
          false,
          `exit code ${exitCode} must not allow a migration`,
        )
      }),
    )
  })
})
