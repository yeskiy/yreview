import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import path from 'node:path'

import {
  DID_NOT_START,
  ProcessGitRunner,
  TIMED_OUT,
  TOO_MUCH_OUTPUT,
  isOk,
  ran,
} from '../../../src/git/runner'
import { git, makeRepo, removeDir } from '../../fixtures/scratch'

const node = (limits = { waitMs: 10_000, maxOutputBytes: 1000 }) =>
  new ProcessGitRunner(process.cwd(), process.execPath, limits)

const MISSING_GIT = 'no-such-git-yreview'

describe('ProcessGitRunner', () => {
  const repo = makeRepo()
  after(() => removeDir(repo))

  it('an answer under the limit comes back whole', async () => {
    const result = await node().run(['-e', "process.stdout.write('x'.repeat(999))"])
    assert.equal(result.stdout.length, 999)
    assert.ok(isOk(result))
  })

  it('a git answer under the limit comes back whole', async () => {
    const result = await new ProcessGitRunner(repo).run(['rev-parse', '--is-inside-work-tree'])
    assert.ok(isOk(result), result.stderr)
    assert.equal(result.stdout.trim(), 'true')
  })

  it('an answer at the limit still comes back', async () => {
    const result = await node().run(['-e', "process.stdout.write('x'.repeat(1000))"])
    assert.equal(result.stdout.length, 1000)
  })

  it('an answer over the limit fails and carries no text', async () => {
    const result = await node().run(['-e', "process.stdout.write('x'.repeat(5000))"])
    assert.equal(result.exitCode, TOO_MUCH_OUTPUT)
    assert.equal(result.stdout, '')
    assert.equal(ran(result), false)
  })

  it('a git answer over the limit fails, names the limit and does not count as a run', async () => {
    writeFileSync(path.join(repo, 'big.bin'), 'a'.repeat(5000))
    const blob = git(repo, 'hash-object', '-w', 'big.bin')
    const limited = new ProcessGitRunner(repo, 'git', { waitMs: 10_000, maxOutputBytes: 4096 })
    const result = await limited.run(['cat-file', '-p', blob])
    assert.equal(result.exitCode, TOO_MUCH_OUTPUT)
    assert.equal(result.stdout, '')
    assert.match(result.stderr, /4096/)
    assert.equal(ran(result), false)
  })

  it('a git that does not start gives a failed answer that names no path', async () => {
    const result = await new ProcessGitRunner(process.cwd(), MISSING_GIT).run(['--version'])
    assert.equal(result.exitCode, DID_NOT_START)
    assert.equal(ran(result), false)
    assert.equal(result.stdout, '')
    assert.notEqual(result.stderr.trim(), '')
    assert.ok(!result.stderr.includes(MISSING_GIT))
  })

  it('a git that ran says that it ran', async () => {
    const runner = new ProcessGitRunner(repo)
    assert.ok(ran(await runner.run(['rev-parse', '--is-inside-work-tree'])))
    const failed = await runner.run(['rev-parse', '--no-such-flag-yreview', 'refs/no/such'])
    assert.ok(failed.exitCode > 0)
    assert.ok(ran(failed))
  })

  it('no sentinel of the runner counts as a run of git', () => {
    ;[DID_NOT_START, TOO_MUCH_OUTPUT, TIMED_OUT].forEach((exitCode) =>
      assert.equal(ran({ exitCode, stdout: '', stderr: '' }), false),
    )
  })

  it('a git that waits past the limit is stopped and reports a timeout', async () => {
    const started = Date.now()
    const result = await node({ waitMs: 500, maxOutputBytes: 1000 }).run([
      '-e',
      'setTimeout(() => {}, 60000)',
    ])
    assert.equal(result.exitCode, TIMED_OUT)
    assert.equal(ran(result), false)
    assert.match(result.stderr, /did not stop in/)
    assert.ok(Date.now() - started < 10_000)
  })

  it('a cancel stops a git that waits', async () => {
    const started = Date.now()
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 300)
    await assert.rejects(node().run(['-e', 'setTimeout(() => {}, 60000)'], controller.signal))
    assert.ok(Date.now() - started < 10_000)
  })

  it('a cancel before the start runs no process', async () => {
    const controller = new AbortController()
    controller.abort()
    await assert.rejects(node().run(['-e', ''], controller.signal))
  })

  it('a child that keeps the pipe open is stopped with its parent', async () => {
    const script =
      "require('child_process').spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'inherit' })"
    const started = Date.now()
    const result = await node({ waitMs: 1000, maxOutputBytes: 1000 }).run(['-e', script])
    assert.equal(result.exitCode, TIMED_OUT)
    assert.ok(Date.now() - started < 10_000)
  })

  it('a run inside the limit still answers', async () => {
    const result = await node({ waitMs: 5000, maxOutputBytes: 1000 }).run([
      '-e',
      'setTimeout(() => {}, 100)',
    ])
    assert.ok(isOk(result))
  })

  it('an argument with quotes and spaces reaches git as one argument', async () => {
    const value = '{"a": "b c"} $(x) `y` ; & |'
    const result = await node().run(['-e', 'process.stdout.write(process.argv[1])', value])
    assert.equal(result.stdout, value)
  })

  it('a GIT_DIR of the environment does not move git to another repository', async () => {
    const other = makeRepo()
    const saved = process.env.GIT_DIR
    process.env.GIT_DIR = path.join(other, '.git')
    try {
      const result = await new ProcessGitRunner(repo).run([
        'rev-parse',
        '--path-format=absolute',
        '--git-dir',
      ])
      assert.equal(path.resolve(result.stdout.trim()), path.join(repo, '.git'))
    } finally {
      if (saved === undefined) delete process.env.GIT_DIR
      else process.env.GIT_DIR = saved
      removeDir(other)
    }
  })
})
