import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'

import { NotesGateway } from '../../../src/git/notes'
import { type GitRunner, ProcessGitRunner } from '../../../src/git/runner'
import { git, makeRepo, removeDir } from '../../fixtures/scratch'

const REF = 'refs/notes/y-review/local'
const WRITERS = 6

/** Runs `between` one time, right after the first `git notes show` of the wrapped runner. */
const writerBetween = (real: GitRunner, between: () => void): GitRunner => {
  const state = { done: false }
  return {
    run: async (args, signal) => {
      const result = await real.run(args, signal)
      if (args[0] === 'notes' && args.includes('show') && !state.done) {
        state.done = true
        between()
      }
      return result
    },
  }
}

const sorted = (lines: readonly string[]): string[] => [...lines].sort()

describe('notes race', function race() {
  this.timeout(240_000)
  const repo = makeRepo()
  const head = git(repo, 'rev-parse', 'HEAD')
  after(() => removeDir(repo))

  it('a delete keeps a comment that another writer added after the read', async () => {
    const gateway = new NotesGateway(new ProcessGitRunner(repo))
    await gateway.append(REF, head, '{"n":"keep"}')
    await gateway.append(REF, head, '{"n":"drop"}')
    const racing = writerBetween(new ProcessGitRunner(repo), () =>
      git(repo, 'notes', '--ref', REF, 'append', '-m', '{"n":"late"}', head),
    )
    await new NotesGateway(racing).edit(REF, head, (lines) =>
      lines.filter((line) => !line.includes('drop')),
    )
    assert.deepEqual(await gateway.readOrRefuse(REF, head), ['{"n":"keep"}', '{"n":"late"}'])
  })

  it('a change that another writer races inside the edit is kept too', async () => {
    const ref = `${REF}-inside`
    const gateway = new NotesGateway(new ProcessGitRunner(repo))
    await gateway.append(ref, head, '{"n":"keep"}')
    await gateway.append(ref, head, '{"n":"drop"}')
    const writes = { done: false }
    await gateway.edit(ref, head, (lines) => {
      if (!writes.done) {
        writes.done = true
        git(repo, 'notes', '--ref', ref, 'append', '-m', '{"n":"late"}', head)
      }
      return lines.filter((line) => !line.includes('drop'))
    })
    assert.deepEqual(await gateway.readOrRefuse(ref, head), ['{"n":"keep"}', '{"n":"late"}'])
  })

  it('writers on several gateways lose no comment', async () => {
    const ref = `${REF}-gateways`
    const doomed = Array.from({ length: WRITERS }, (_, index) => `{"delete":${index}}`)
    await doomed.reduce(
      (chain, line) =>
        chain.then(() => new NotesGateway(new ProcessGitRunner(repo)).append(ref, head, line)),
      Promise.resolve(),
    )
    const added = Array.from({ length: WRITERS }, (_, index) => `{"add":${index}}`)
    await Promise.all([
      ...added.map((line) => new NotesGateway(new ProcessGitRunner(repo)).append(ref, head, line)),
      ...doomed.map((line) =>
        new NotesGateway(new ProcessGitRunner(repo)).edit(ref, head, (lines) =>
          lines.filter((stored) => stored !== line),
        ),
      ),
    ])
    const stored = await new NotesGateway(new ProcessGitRunner(repo)).readOrRefuse(ref, head)
    assert.deepEqual(sorted(stored), sorted(added))
  })

  it('writers in several processes lose no comment', async () => {
    const ref = `${REF}-processes`
    const doomed = Array.from({ length: WRITERS }, (_, index) => `{"delete":${index}}`)
    await doomed.reduce(
      (chain, line) =>
        chain.then(() => new NotesGateway(new ProcessGitRunner(repo)).append(ref, head, line)),
      Promise.resolve(),
    )
    const writer = path.join(__dirname, 'raceWriter.ts')
    const results = await Promise.all(
      doomed.map((drop, index) =>
        promisify(execFile)(
          process.execPath,
          ['--import', 'tsx', writer, repo, ref, head, `{"add":${index}}`, drop],
          { cwd: process.cwd(), encoding: 'utf8' },
        ).then(({ stdout }) => JSON.parse(stdout) as { added: boolean; dropped: boolean }),
      ),
    )
    const expected = [
      ...results.flatMap((result, index) => (result.added ? [`{"add":${index}}`] : [])),
      ...results.flatMap((result, index) => (result.dropped ? [] : [doomed[index] ?? ''])),
    ]
    const stored = await new NotesGateway(new ProcessGitRunner(repo)).readOrRefuse(ref, head)
    assert.ok(
      results.some((result) => result.added && result.dropped),
      'at least one writer must finish',
    )
    assert.deepEqual(sorted(stored), sorted(expected))
  })

  it('a write leaves no scratch ref', () => {
    assert.equal(git(repo, 'for-each-ref', 'refs/notes/y-review/scratch/'), '')
  })
})
