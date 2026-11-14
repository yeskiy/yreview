import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import path from 'node:path'

import { NotesGateway } from '../../../src/git/notes'
import { type GitRunner, ProcessGitRunner } from '../../../src/git/runner'
import { FETCH_REFSPEC, FORCED_REFSPEC, NotesSharing } from '../../../src/git/sharing'
import { git, makeRemote, makeRepo, removeDir, scratchDir } from '../../fixtures/scratch'

const DISCUSS = 'refs/notes/devtools/discuss'
const NOTE = '{"timestamp":"1787194427","author":"a@b.c"}'
const THEIRS = '{"timestamp":"1787194428","author":"other@b.c"}'
const MINE = '{"timestamp":"1787194429","author":"a@b.c"}'

/** The answer of git, also when git fails. */
const attempt = (cwd: string, ...args: string[]): { ok: boolean; out: string } => {
  try {
    return { ok: true, out: git(cwd, ...args) }
  } catch (error) {
    return { ok: false, out: String((error as { stderr?: string }).stderr ?? '') }
  }
}

const fetchRefspecs = (repo: string): string[] =>
  attempt(repo, 'config', '--get-all', 'remote.origin.fetch')
    .out.split(/\r?\n/)
    .map((value) => value.trim())
    .filter((value) => value !== '')

const commit = (repo: string, file: string, text: string): string => {
  writeFileSync(path.join(repo, file), text)
  git(repo, 'add', file)
  git(repo, 'commit', '-q', '-m', file)
  return git(repo, 'rev-parse', 'HEAD')
}

describe('NotesSharing', () => {
  const dirs: string[] = []
  const track = (dir: string): string => {
    dirs.push(dir)
    return dir
  }
  after(() => dirs.forEach(removeDir))

  /** A clone of a bare remote with one new commit. `bare` is the remote path. */
  const cloned = () => {
    const remote = makeRemote()
    track(remote.bare)
    const repo = track(remote.clone())
    const runner = new ProcessGitRunner(repo)
    return {
      ...remote,
      repo,
      runner,
      head: commit(repo, 'a.kt', 'one'),
      gateway: new NotesGateway(runner),
    }
  }

  /** A repository with no remote, and a bare repository that no remote names. */
  const loose = () => {
    const repo = track(makeRepo())
    const bare = track(scratchDir())
    git(bare, 'init', '-q', '--bare', '-b', 'main')
    const runner = new ProcessGitRunner(repo)
    return {
      repo,
      bare,
      runner,
      head: commit(repo, 'a.kt', 'one'),
      gateway: new NotesGateway(runner),
    }
  }

  /** Shares one note, moves the remote ref on, and writes a note that no push carried. */
  const diverge = async (repo: string, runner: GitRunner, head: string): Promise<void> => {
    const gateway = new NotesGateway(runner)
    assert.ok((await new NotesSharing(runner).addFetchRefspec()).ok)
    await gateway.append(DISCUSS, head, NOTE)
    assert.ok((await new NotesSharing(runner).share(DISCUSS)).ok)
    const first = git(repo, 'rev-parse', DISCUSS)
    await gateway.append(DISCUSS, head, THEIRS)
    assert.ok((await new NotesSharing(runner).share(DISCUSS)).ok)
    git(repo, 'update-ref', DISCUSS, first)
    await gateway.append(DISCUSS, head, MINE)
  }

  it('pushes the shared ref to the remote', async () => {
    const { bare, runner, head, gateway } = cloned()
    await gateway.append(DISCUSS, head, NOTE)
    const result = await new NotesSharing(runner).share(DISCUSS)
    assert.ok(result.ok, result.message)
    assert.ok(attempt(bare, 'rev-parse', '--verify', DISCUSS).ok)
  })

  it('a share writes no fetch refspec and reports that it is missing', async () => {
    const { repo, runner, head, gateway } = cloned()
    await gateway.append(DISCUSS, head, NOTE)
    const before = fetchRefspecs(repo)
    const results = await [1, 2, 3].reduce(
      (chain) =>
        chain.then(async (done) => [...done, await new NotesSharing(runner).share(DISCUSS)]),
      Promise.resolve([] as Awaited<ReturnType<NotesSharing['share']>>[]),
    )
    assert.ok(
      results.every((result) => result.ok && result.needsRefspec),
      JSON.stringify(results),
    )
    assert.deepEqual(fetchRefspecs(repo), before, 'a share must not write the git configuration')
  })

  it('add writes the fetch refspec once', async () => {
    const { repo, runner, head, gateway } = cloned()
    await gateway.append(DISCUSS, head, NOTE)
    assert.ok((await new NotesSharing(runner).addFetchRefspec()).ok)
    assert.ok((await new NotesSharing(runner).addFetchRefspec()).ok)
    assert.equal(fetchRefspecs(repo).filter((value) => value === FETCH_REFSPEC).length, 1)
    assert.equal((await new NotesSharing(runner).share(DISCUSS)).needsRefspec, false)
  })

  it('keeps the branch refspec the remote already had', async () => {
    const { repo, runner, head, gateway } = cloned()
    await gateway.append(DISCUSS, head, NOTE)
    await new NotesSharing(runner).share(DISCUSS)
    assert.ok(fetchRefspecs(repo).some((value) => value.startsWith('+refs/heads/')))
  })

  it('reports the failure and keeps the note when the remote path is not there', async () => {
    const { repo, runner, head, gateway } = loose()
    git(repo, 'remote', 'add', 'origin', `${repo.replace(/\\/g, '/')}/no-such-remote`)
    await gateway.append(DISCUSS, head, NOTE)
    const result = await new NotesSharing(runner).share(DISCUSS)
    assert.equal(result.ok, false)
    assert.notEqual(result.message.trim(), '')
    assert.deepEqual(await gateway.readLines(DISCUSS, head), [NOTE])
  })

  it('reports an unknown remote name, runs no push, and keeps the note', async () => {
    const { runner, head, gateway } = cloned()
    await gateway.append(DISCUSS, head, NOTE)
    const pushes: string[] = []
    const spy: GitRunner = {
      run: (args, signal) => {
        if (args[0] === 'push') pushes.push(args.join(' '))
        return runner.run(args, signal)
      },
    }
    const result = await new NotesSharing(spy, 'upstream').share(DISCUSS)
    assert.deepEqual(result, {
      ok: false,
      message: 'Git has no remote with the name upstream. The comment stays in the local notes.',
      needsRefspec: false,
    })
    assert.deepEqual(pushes, [])
    assert.deepEqual(await gateway.readLines(DISCUSS, head), [NOTE])
  })

  it('pushes to the remote that the settings name', async () => {
    const { repo, bare, runner, head, gateway } = loose()
    git(repo, 'remote', 'add', 'upstream', bare)
    await gateway.append(DISCUSS, head, NOTE)
    const result = await new NotesSharing(runner, 'upstream').share(DISCUSS)
    assert.ok(result.ok, result.message)
    assert.ok(attempt(bare, 'rev-parse', '--verify', DISCUSS).ok, 'not every remote is origin')
  })

  it('a closed refspec switch writes no git configuration', async () => {
    const { repo, runner, head, gateway } = cloned()
    await gateway.append(DISCUSS, head, NOTE)
    const result = await new NotesSharing(runner, 'origin', false).share(DISCUSS)
    assert.ok(result.ok, result.message)
    assert.equal(result.needsRefspec, false)
    assert.ok(!fetchRefspecs(repo).includes(FETCH_REFSPEC), 'the user owns the git configuration')
  })

  it('reports the failure when the repository has no remote', async () => {
    const { runner, head, gateway } = loose()
    await gateway.append(DISCUSS, head, NOTE)
    const result = await new NotesSharing(runner).share(DISCUSS)
    assert.equal(result.ok, false)
    assert.notEqual(result.message.trim(), '')
  })

  it('an ordinary fetch keeps a note that no push carried', async () => {
    const { repo, runner, head, gateway } = cloned()
    await diverge(repo, runner, head)
    assert.equal(attempt(repo, 'fetch', 'origin').ok, false, 'git must refuse a non-fast-forward')
    assert.deepEqual(await gateway.readLines(DISCUSS, head), [NOTE, MINE])
  })

  it('an ordinary fetch still brings the notes that the remote holds', async () => {
    const { repo, runner, head, gateway } = cloned()
    assert.ok((await new NotesSharing(runner).addFetchRefspec()).ok)
    await gateway.append(DISCUSS, head, NOTE)
    assert.ok((await new NotesSharing(runner).share(DISCUSS)).ok)
    const first = git(repo, 'rev-parse', DISCUSS)
    await gateway.append(DISCUSS, head, THEIRS)
    assert.ok((await new NotesSharing(runner).share(DISCUSS)).ok)
    git(repo, 'update-ref', DISCUSS, first)
    const fetched = attempt(repo, 'fetch', 'origin')
    assert.ok(fetched.ok, fetched.out)
    assert.deepEqual(await gateway.readLines(DISCUSS, head), [NOTE, THEIRS])
  })

  it('add drops the forced refspec that an older version wrote', async () => {
    const { repo, runner, head, gateway } = cloned()
    git(repo, 'config', '--add', 'remote.origin.fetch', FORCED_REFSPEC)
    await gateway.append(DISCUSS, head, NOTE)
    assert.ok(
      (await new NotesSharing(runner).share(DISCUSS)).needsRefspec,
      'a forced one is unsafe',
    )
    assert.ok((await new NotesSharing(runner).addFetchRefspec()).ok)
    assert.ok(!fetchRefspecs(repo).includes(FORCED_REFSPEC), 'the forced refspec must go')
    assert.equal(fetchRefspecs(repo).filter((value) => value === FETCH_REFSPEC).length, 1)
    assert.ok(fetchRefspecs(repo).some((value) => value.startsWith('+refs/heads/')))
  })

  it('a fetch after the repair keeps a note that no push carried', async () => {
    const { repo, runner, head, gateway } = cloned()
    git(repo, 'config', '--add', 'remote.origin.fetch', FORCED_REFSPEC)
    await diverge(repo, runner, head)
    assert.equal(attempt(repo, 'fetch', 'origin').ok, false)
    assert.deepEqual(await gateway.readLines(DISCUSS, head), [NOTE, MINE])
  })

  it('a failed push leaves the git configuration alone', async () => {
    const { repo, runner, head, gateway } = loose()
    git(repo, 'remote', 'add', 'origin', `${repo.replace(/\\/g, '/')}/no-such-remote`)
    await gateway.append(DISCUSS, head, NOTE)
    const result = await new NotesSharing(runner).share(DISCUSS)
    assert.equal(result.ok, false)
    assert.ok(!fetchRefspecs(repo).includes(FETCH_REFSPEC), 'a failed push writes nothing')
  })

  it('a remote setting that names a path pushes nothing and adds no remote', async () => {
    const { repo, bare, runner, head, gateway } = loose()
    await gateway.append(DISCUSS, head, NOTE)
    const target = bare.replace(/\\/g, '/')
    const result = await new NotesSharing(runner, target).share(DISCUSS)
    assert.deepEqual(result, {
      ok: false,
      message: `Git has no remote with the name ${target}. The comment stays in the local notes.`,
      needsRefspec: false,
    })
    assert.equal(attempt(repo, 'config', '--get-regexp', '^remote\\.').out, '')
    assert.equal(attempt(bare, 'rev-parse', '--verify', DISCUSS).ok, false)
    assert.equal((await new NotesSharing(runner, target).addFetchRefspec()).ok, false)
    assert.equal(attempt(repo, 'config', '--get-regexp', '^remote\\.').out, '')
  })

  // --- Values that git could read as options ---

  it('refuses a remote that starts with a hyphen and a ref that is not a note ref', async () => {
    const { bare, runner, head, gateway } = cloned()
    await gateway.append(DISCUSS, head, NOTE)
    const pushes: string[] = []
    const spy: GitRunner = {
      run: (args, signal) => {
        if (args[0] === 'push') pushes.push(args.join(' '))
        return runner.run(args, signal)
      },
    }
    const answers = await Promise.all([
      new NotesSharing(spy, '--mirror').share(DISCUSS),
      new NotesSharing(spy).share(':refs/heads/main'),
      new NotesSharing(spy).share('+refs/notes/devtools/discuss'),
      new NotesSharing(spy).share('refs/heads/main'),
      new NotesSharing(spy).share('--all'),
    ])
    assert.ok(answers.every((answer) => !answer.ok))
    assert.deepEqual(pushes, [])
    assert.ok(attempt(bare, 'rev-parse', '--verify', 'refs/heads/main').ok)
  })

  // --- Two clones of one bare remote ---

  it('two clones see the shared notes of each other through the bare remote', async () => {
    const remote = makeRemote()
    track(remote.bare)
    const first = track(remote.clone())
    const second = track(remote.clone())
    const head = git(first, 'rev-parse', 'HEAD')
    const firstRunner = new ProcessGitRunner(first)
    const secondRunner = new ProcessGitRunner(second)
    await Promise.all(
      [firstRunner, secondRunner].map(async (runner) =>
        assert.ok((await new NotesSharing(runner).addFetchRefspec()).ok),
      ),
    )

    await new NotesGateway(firstRunner).append(DISCUSS, head, NOTE)
    assert.ok((await new NotesSharing(firstRunner).share(DISCUSS)).ok)
    git(second, 'fetch', '-q', 'origin')
    assert.deepEqual(await new NotesGateway(secondRunner).readLines(DISCUSS, head), [NOTE])

    await new NotesGateway(secondRunner).edit(DISCUSS, head, (lines) => [...lines, THEIRS])
    const shared = await new NotesSharing(secondRunner).share(DISCUSS)
    assert.ok(shared.ok, shared.message)
    assert.equal(shared.needsRefspec, false)
    git(first, 'fetch', '-q', 'origin')
    assert.deepEqual(await new NotesGateway(firstRunner).readLines(DISCUSS, head), [NOTE, THEIRS])
    assert.deepEqual(
      execFileSync('git', ['for-each-ref', '--format=%(refname)', 'refs/notes/'], {
        cwd: remote.bare,
        encoding: 'utf8',
      }).trim(),
      DISCUSS,
    )
  })
})
