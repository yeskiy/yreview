import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import path from 'node:path'

import { NotesWriteError } from '../../../src/git/errors'
import { NotesGateway } from '../../../src/git/notes'
import {
  DID_NOT_START,
  type GitResult,
  type GitRunner,
  ProcessGitRunner,
  TOO_MUCH_OUTPUT,
} from '../../../src/git/runner'
import { git, makeRepo, removeDir } from '../../fixtures/scratch'

const LOCAL = 'refs/notes/y-review/local'
const DISCUSS = 'refs/notes/devtools/discuss'

const oneAnswer = (answer: GitResult): GitRunner => ({ run: () => Promise.resolve(answer) })
const tooMuch = oneAnswer({
  exitCode: TOO_MUCH_OUTPUT,
  stdout: '',
  stderr: 'the note passed the limit',
})
const noGit = oneAnswer({ exitCode: DID_NOT_START, stdout: '', stderr: 'could not start git' })
const refused = (error: unknown): boolean => error instanceof NotesWriteError

const commit = (repo: string, file: string, text: string): string => {
  writeFileSync(path.join(repo, file), text)
  git(repo, 'add', file)
  git(repo, 'commit', '-q', '-m', file)
  return git(repo, 'rev-parse', 'HEAD')
}

describe('NotesGateway', () => {
  const repos: string[] = []
  const fresh = (): { repo: string; head: string; gateway: NotesGateway } => {
    const repo = makeRepo()
    repos.push(repo)
    return {
      repo,
      head: commit(repo, 'a.txt', 'one'),
      gateway: new NotesGateway(new ProcessGitRunner(repo)),
    }
  }
  after(() => repos.forEach(removeDir))

  it('returns nothing when the ref does not exist', async () => {
    const { head, gateway } = fresh()
    assert.deepEqual(await gateway.readLines(LOCAL, head), [])
  })

  it('appends and reads one line', async () => {
    const { head, gateway } = fresh()
    await gateway.append(LOCAL, head, '{"timestamp":"1700000000","author":"a@b.c"}')
    assert.equal((await gateway.readLines(LOCAL, head)).length, 1)
  })

  it('keeps every appended line and drops the blank separators', async () => {
    const { head, gateway } = fresh()
    await [0, 1, 2].reduce(
      (chain, index) =>
        chain.then(() =>
          gateway.append(LOCAL, head, `{"timestamp":"170000000${index}","author":"a@b.c"}`),
        ),
      Promise.resolve(),
    )
    const lines = await gateway.readLines(LOCAL, head)
    assert.equal(lines.length, 3)
    assert.ok(lines.every((line) => line.trim() !== ''))
  })

  it('keeps a line that holds both quotes and spaces byte for byte', async () => {
    const { head, gateway } = fresh()
    const line = '{"timestamp":"1787194427","author":"a@b.c","description":"fix this thing"}'
    await gateway.append(LOCAL, head, line)
    assert.deepEqual(await gateway.readLines(LOCAL, head), [line])
  })

  it('keeps the refs apart', async () => {
    const { head, gateway } = fresh()
    await gateway.append(LOCAL, head, '{"timestamp":"1700000000","author":"local"}')
    await gateway.append(DISCUSS, head, '{"timestamp":"1700000001","author":"shared"}')
    assert.match((await gateway.readLines(LOCAL, head)).join(), /local/)
    assert.match((await gateway.readLines(DISCUSS, head)).join(), /shared/)
    assert.equal((await gateway.readLines(LOCAL, head)).length, 1)
  })

  it('lists the commits that carry a note', async () => {
    const { repo, head: first, gateway } = fresh()
    const second = commit(repo, 'b.txt', 'two')
    await gateway.append(LOCAL, first, '{"timestamp":"1700000000","author":"a@b.c"}')
    await gateway.append(LOCAL, second, '{"timestamp":"1700000001","author":"a@b.c"}')
    assert.deepEqual([...(await gateway.commitsWithNotes(LOCAL))].sort(), [first, second].sort())
  })

  it('rewrite keeps the lines it is given and drops the rest', async () => {
    const { head, gateway } = fresh()
    const lines = [1, 2, 3].map(
      (index) => `{"timestamp":"170000000${index}","author":"a@b.c","description":"fix it"}`,
    )
    await lines.reduce(
      (chain, line) => chain.then(() => gateway.append(LOCAL, head, line)),
      Promise.resolve(),
    )
    await gateway.rewrite(LOCAL, head, [lines[0] ?? '', lines[2] ?? ''])
    assert.deepEqual(await gateway.readLines(LOCAL, head), [lines[0], lines[2]])
  })

  it('rewrite writes the same layout that append writes', async () => {
    const { repo, head, gateway } = fresh()
    const first = '{"timestamp":"1700000000","author":"a@b.c"}'
    const second = '{"timestamp":"1700000001","author":"a@b.c"}'
    await gateway.append(LOCAL, head, first)
    await gateway.append(LOCAL, head, second)
    const show = () => git(repo, 'cat-file', '-p', `${LOCAL}:${head}`)
    const appended = show()
    await gateway.rewrite(LOCAL, head, [second, first])
    await gateway.rewrite(LOCAL, head, [first, second])
    assert.equal(show(), appended)
  })

  it('rewrite with no line removes the note and keeps the ref', async () => {
    const { repo, head, gateway } = fresh()
    await gateway.append(LOCAL, head, '{"timestamp":"1700000000","author":"a@b.c"}')
    await gateway.rewrite(LOCAL, head, [])
    assert.deepEqual(await gateway.readLines(LOCAL, head), [])
    assert.deepEqual(await gateway.commitsWithNotes(LOCAL), [])
    assert.notEqual(git(repo, 'rev-parse', '--verify', LOCAL), '')
  })

  it('rewrite with no line accepts a commit that carries no note', async () => {
    const { head, gateway } = fresh()
    await gateway.rewrite(LOCAL, head, [])
  })

  it('rewrite keeps the other ref untouched', async () => {
    const { head, gateway } = fresh()
    await gateway.append(LOCAL, head, '{"timestamp":"1700000000","author":"local"}')
    await gateway.append(DISCUSS, head, '{"timestamp":"1700000001","author":"shared"}')
    await gateway.rewrite(LOCAL, head, [])
    assert.match((await gateway.readLines(DISCUSS, head)).join(), /shared/)
  })

  it('a rewrite that changes no line writes nothing', async () => {
    const { repo, head, gateway } = fresh()
    const line = '{"timestamp":"1700000000","author":"a@b.c"}'
    await gateway.append(LOCAL, head, line)
    const before = git(repo, 'rev-parse', LOCAL)
    assert.deepEqual(await gateway.edit(LOCAL, head, (lines) => [...lines]), [line])
    assert.equal(git(repo, 'rev-parse', LOCAL), before)
  })

  it('reports a rewrite against a revision that does not resolve', async () => {
    const { gateway } = fresh()
    await assert.rejects(gateway.rewrite(LOCAL, 'not-a-rev', ['{}']), refused)
  })

  it('reports a write against a revision that does not resolve', async () => {
    const { gateway } = fresh()
    await assert.rejects(gateway.append(LOCAL, 'not-a-rev', '{}'), refused)
  })

  it('a failed write leaves no scratch ref', async () => {
    const { repo, gateway } = fresh()
    await assert.rejects(gateway.append(LOCAL, 'not-a-rev', '{}'), refused)
    assert.equal(git(repo, 'for-each-ref', 'refs/notes/y-review/scratch/'), '')
  })

  // --- Values that git could read as options ---

  it('refuses a commit that starts with a hyphen and runs no git', async () => {
    const calls: string[][] = []
    const spy: GitRunner = {
      run: (args) => {
        calls.push([...args])
        return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' })
      },
    }
    const gateway = new NotesGateway(spy)
    await assert.rejects(gateway.readOrRefuse(LOCAL, '--output=x'), refused)
    await assert.rejects(gateway.append(LOCAL, '-f', '{}'), refused)
    await assert.rejects(gateway.rewrite(LOCAL, '', []), refused)
    assert.deepEqual(calls, [])
  })

  it('refuses a ref outside refs/notes and a ref that holds a refspec', async () => {
    const { repo, head, gateway } = fresh()
    const main = git(repo, 'rev-parse', 'refs/heads/main')
    await assert.rejects(gateway.append('refs/heads/main', head, '{}'), refused)
    await assert.rejects(gateway.append('--ref=refs/heads/main', head, '{}'), refused)
    await assert.rejects(gateway.readOrRefuse('refs/notes/a:refs/heads/main', head), refused)
    await assert.rejects(gateway.commitsOrRefuse('-q'), refused)
    assert.equal(git(repo, 'rev-parse', 'refs/heads/main'), main)
  })

  // --- A read the extension cannot trust ---

  it('the refusing read gives no record for a commit that carries no note', async () => {
    const { head, gateway } = fresh()
    assert.deepEqual(await gateway.readOrRefuse(LOCAL, head), [])
  })

  it('the refusing read stops a note the runner refused', async () => {
    await assert.rejects(new NotesGateway(tooMuch).readOrRefuse(LOCAL, 'deadbeef'), refused)
  })

  it('the refusing read stops a git that never started', async () => {
    await assert.rejects(new NotesGateway(noGit).readOrRefuse(LOCAL, 'deadbeef'), refused)
  })

  it('the quiet read gives no record for a note the runner refused', async () => {
    assert.deepEqual(await new NotesGateway(tooMuch).readLines(LOCAL, 'deadbeef'), [])
  })

  it('the refusing list stops a git that never started', async () => {
    await assert.rejects(new NotesGateway(noGit).commitsOrRefuse(LOCAL), refused)
  })

  it('the refusing list gives no key for a ref that holds no note', async () => {
    const { gateway } = fresh()
    assert.deepEqual(await gateway.commitsOrRefuse(LOCAL), [])
  })

  it('the quiet list gives no key for a git that never started', async () => {
    assert.deepEqual(await new NotesGateway(noGit).commitsWithNotes(LOCAL), [])
  })

  it('a refused read never counts as an empty note, so the write stops', async () => {
    const { repo, head } = fresh()
    const real = new ProcessGitRunner(repo)
    const line = '{"timestamp":"1700000000","author":"a@b.c"}'
    await new NotesGateway(real).append(LOCAL, head, line)
    const refusingShow: GitRunner = {
      run: (args, signal) =>
        args.includes('show')
          ? Promise.resolve({ exitCode: TOO_MUCH_OUTPUT, stdout: '', stderr: 'too much' })
          : real.run(args, signal),
    }
    await assert.rejects(new NotesGateway(refusingShow).rewrite(LOCAL, head, []), refused)
    assert.deepEqual(await new NotesGateway(real).readLines(LOCAL, head), [line])
  })
})
