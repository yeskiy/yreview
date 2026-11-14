import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import path from 'node:path'

import { encodeRecord } from '../../../src/core/record'
import { NotesWriteError } from '../../../src/git/errors'
import { FETCH_REFSPEC } from '../../../src/git/sharing'
import { DISCUSS, LOCAL } from '../../../src/store/noteRefs'
import {
  type Anchor,
  type RefspecAnswer,
  ReviewService,
  type ServiceHost,
} from '../../../src/store/reviewService'
import { git, makeRemote, makeRepo, removeDir, scratchDir } from '../../fixtures/scratch'

const host = (
  answers: RefspecAnswer[],
  declined: string[] = [],
  options: { gitPath?: string; writeRefspec?: boolean } = {},
) => {
  const asked: string[] = []
  const warnings: string[] = []
  const store = { declined }
  const value: ServiceHost = {
    gitPath: () => options.gitPath ?? 'git',
    settings: () => ({ remote: 'origin', writeRefspec: options.writeRefspec ?? true }),
    askRefspec: (root) => {
      asked.push(root)
      return Promise.resolve(answers.shift())
    },
    declinedRoots: () => store.declined,
    saveDeclinedRoots: (roots) => {
      store.declined = [...roots]
      return Promise.resolve()
    },
    workspaceFolders: () => [],
    toldFolders: () => [],
    saveToldFolders: () => Promise.resolve(),
    say: () => undefined,
    warn: (message) => {
      warnings.push(message)
    },
  }
  return { value, asked, warnings, store }
}

const fetchRefspecs = (dir: string): readonly string[] =>
  git(dir, 'config', '--get-all', 'remote.origin.fetch').split('\n')

describe('ReviewService', function reviewService() {
  this.timeout(120_000)
  const dirs: string[] = []
  after(() => dirs.forEach(removeDir))
  const repo = (): string => {
    const dir = makeRepo()
    dirs.push(dir)
    return dir
  }
  const remote = () => {
    const made = makeRemote()
    dirs.push(made.bare)
    return {
      bare: made.bare,
      clone: () => {
        const dir = made.clone()
        dirs.push(dir)
        return dir
      },
    }
  }
  const anchored = async (service: ReviewService, dir: string): Promise<Anchor> => {
    const result = await service.anchorOf(path.join(dir, 'src', 'a.txt'))
    return result.kind === 'found' ? result.anchor : assert.fail(`no anchor: ${result.kind}`)
  }

  it('anchors a file of a repository to HEAD and its path', async () => {
    const dir = repo()
    const result = await new ReviewService(host([]).value).anchorOf(path.join(dir, 'src', 'a.txt'))
    assert.deepEqual(result, {
      kind: 'found',
      anchor: {
        store: 'git',
        root: git(dir, 'rev-parse', '--show-toplevel'),
        head: git(dir, 'rev-parse', 'HEAD'),
        path: 'src/a.txt',
      },
    })
  })

  it('refuses a repository with no commit', async () => {
    const dir = scratchDir()
    dirs.push(dir)
    git(dir, 'init', '-q')
    writeFileSync(path.join(dir, 'a.txt'), 'x')
    assert.deepEqual(await new ReviewService(host([]).value).anchorOf(path.join(dir, 'a.txt')), {
      kind: 'noCommit',
    })
  })

  it('refuses a file outside every repository and every workspace folder', async () => {
    const dir = scratchDir()
    dirs.push(dir)
    writeFileSync(path.join(dir, 'a.txt'), 'x')
    assert.deepEqual(await new ReviewService(host([]).value).anchorOf(path.join(dir, 'a.txt')), {
      kind: 'noPlace',
    })
  })

  it('refuses a file in a folder that does not exist', async () => {
    const dir = repo()
    assert.deepEqual(
      await new ReviewService(host([]).value).anchorOf(path.join(dir, 'gone', 'a.txt')),
      { kind: 'noPlace' },
    )
  })

  it('stops when git does not start, and states no repository fact', async () => {
    const dir = repo()
    const service = new ReviewService(host([], [], { gitPath: 'no-such-git-yreview' }).value)
    await assert.rejects(service.anchorOf(path.join(dir, 'src', 'a.txt')), NotesWriteError)
    assert.deepEqual(service.knownRoots(), [])
  })

  it('writes a local comment, pushes nothing, and tells the listeners', async () => {
    const shared = remote()
    const clone = shared.clone()
    const service = new ReviewService(host([]).value)
    const changes: number[] = []
    service.onDidChange(() => changes.push(1))
    const anchor = await anchored(service, clone)
    const written = await service.addComment(anchor, { startLine: 2, endLine: 2 }, 'Local.', false)
    assert.equal(written.stored.ref, LOCAL)
    assert.equal(written.shareError, undefined)
    assert.equal(git(shared.bare, 'for-each-ref', 'refs/notes/'), '')
    assert.equal(changes.length, 1)
    assert.deepEqual(
      (await service.openAt(anchor)).map((s) => s.id),
      [written.stored.id],
    )
  })

  it('pushes a shared comment and asks once about the refspec in a session', async () => {
    const shared = remote()
    const clone = shared.clone()
    const fake = host([undefined])
    const service = new ReviewService(fake.value)
    const anchor = await anchored(service, clone)
    await service.addComment(anchor, { startLine: 1, endLine: 1 }, 'One.', true)
    await service.addComment(anchor, { startLine: 1, endLine: 1 }, 'Two.', true)
    await service.settled()
    assert.notEqual(git(shared.bare, 'for-each-ref', DISCUSS), '')
    assert.equal(fake.asked.length, 1)
    assert.ok(!fetchRefspecs(clone).includes(FETCH_REFSPEC), 'no answer writes no refspec')
  })

  it('adds the refspec after Add, and never asks again after "Do not ask again"', async () => {
    const first = remote().clone()
    const second = remote().clone()
    const fake = host(['add', 'never'])
    const service = new ReviewService(fake.value)
    const a = await anchored(service, first)
    const b = await anchored(service, second)
    await service.addComment(a, { startLine: 1, endLine: 1 }, 'A.', true)
    await service.settled()
    await service.addComment(b, { startLine: 1, endLine: 1 }, 'B.', true)
    await service.settled()
    assert.ok(fetchRefspecs(first).includes(FETCH_REFSPEC))
    assert.ok(!fetchRefspecs(second).includes(FETCH_REFSPEC))
    assert.deepEqual(fake.store.declined, [b.root])
    const later = host([], fake.store.declined)
    const again = new ReviewService(later.value)
    await again.addComment(b, { startLine: 1, endLine: 1 }, 'C.', true)
    await again.settled()
    assert.equal(later.asked.length, 0)
  })

  it('asks nothing when the setting turns the question off', async () => {
    const clone = remote().clone()
    const fake = host(['add'], [], { writeRefspec: false })
    const service = new ReviewService(fake.value)
    await service.addComment(
      await anchored(service, clone),
      { startLine: 1, endLine: 1 },
      'X.',
      true,
    )
    await service.settled()
    assert.equal(fake.asked.length, 0)
    assert.ok(!fetchRefspecs(clone).includes(FETCH_REFSPEC))
  })

  it('keeps a shared comment and reports the reason when the remote is missing', async () => {
    const dir = repo()
    const fake = host(['add'])
    const service = new ReviewService(fake.value)
    const anchor = await anchored(service, dir)
    const written = await service.addComment(anchor, { startLine: 1, endLine: 1 }, 'X.', true)
    await service.settled()
    assert.match(written.shareError ?? '', /no remote/)
    assert.equal(written.stored.ref, DISCUSS)
    assert.equal((await service.openAt(anchor)).length, 1)
    assert.equal(fake.asked.length, 0)
  })

  it('resolves a comment and lists it as closed', async () => {
    const service = new ReviewService(host([]).value)
    const anchor = await anchored(service, repo())
    const written = await service.addComment(anchor, { startLine: 1, endLine: 1 }, 'X.', false)
    const resolved = await service.resolve(anchor, written.stored.id)
    assert.equal(resolved.stored.record.original, written.stored.id)
    assert.deepEqual(await service.openAt(anchor), [])
  })

  it('refuses to resolve a comment that is not in the notes', async () => {
    const service = new ReviewService(host([]).value)
    const anchor = await anchored(service, repo())
    await assert.rejects(service.resolve(anchor, '0'.repeat(40)), NotesWriteError)
  })

  it('deletes a shared comment and pushes the delete', async () => {
    const shared = remote()
    const clone = shared.clone()
    const service = new ReviewService(host([]).value)
    const anchor = await anchored(service, clone)
    const kept = await service.addComment(anchor, { startLine: 1, endLine: 1 }, 'Keep.', true)
    const gone = await service.addComment(anchor, { startLine: 2, endLine: 2 }, 'Gone.', true)
    await service.resolve(anchor, gone.stored.id)
    const changes: number[] = []
    service.onDidChange(() => changes.push(1))
    const result = await service.remove(anchor, [gone.stored.id])
    assert.deepEqual(result, { removed: 2, shareError: undefined })
    assert.equal(changes.length, 1)
    assert.equal(
      git(clone, 'rev-parse', DISCUSS),
      git(shared.bare, 'rev-parse', DISCUSS),
      'the remote holds the note after the delete',
    )
    assert.deepEqual(
      (await service.openAt(anchor)).map((s) => s.id),
      [kept.stored.id],
    )
  })

  it('a delete of an unknown comment writes nothing and tells nobody', async () => {
    const service = new ReviewService(host([]).value)
    const anchor = await anchored(service, repo())
    await service.addComment(anchor, { startLine: 1, endLine: 1 }, 'X.', false)
    const changes: number[] = []
    service.onDidChange(() => changes.push(1))
    assert.deepEqual(await service.remove(anchor, ['0'.repeat(40)]), { removed: 0 })
    assert.equal(changes.length, 0)
  })

  it('shows no record whose path leaves the repository', async () => {
    const dir = repo()
    const service = new ReviewService(host([]).value)
    const anchor = await anchored(service, dir)
    const outside: Anchor = { ...anchor, path: '../outside.txt' }
    git(
      dir,
      'notes',
      '--ref',
      LOCAL,
      'append',
      '-m',
      encodeRecord({
        timestamp: '1',
        author: 'a@b.c',
        description: 'escape',
        location: { commit: anchor.head, path: outside.path },
      }),
      anchor.head,
    )
    assert.deepEqual(await service.openAt(outside), [])
  })

  it('a write without an author fails with a clear message, and a read still works', async () => {
    const dir = repo()
    const empty = path.join(scratchDir(), 'empty.gitconfig')
    dirs.push(path.dirname(empty))
    writeFileSync(empty, '')
    git(dir, 'config', '--unset', 'user.email')
    const saved = { global: process.env.GIT_CONFIG_GLOBAL, system: process.env.GIT_CONFIG_NOSYSTEM }
    Object.assign(process.env, { GIT_CONFIG_GLOBAL: empty, GIT_CONFIG_NOSYSTEM: '1' })
    try {
      const service = new ReviewService(host([]).value)
      const anchor = await anchored(service, dir)
      await assert.rejects(
        service.addComment(anchor, { startLine: 1, endLine: 1 }, 'X.', false),
        (error: unknown) => error instanceof NotesWriteError && /user\.email/.test(error.message),
      )
      assert.deepEqual(await service.openAt(anchor), [])
      assert.equal(git(dir, 'for-each-ref', 'refs/notes/'), '')
    } finally {
      Object.entries({
        GIT_CONFIG_GLOBAL: saved.global,
        GIT_CONFIG_NOSYSTEM: saved.system,
      }).forEach(([name, value]) => {
        if (value === undefined) delete process.env[name]
        else process.env[name] = value
      })
    }
  })

  it('remembers each repository root it anchored, for the log redaction', async () => {
    const dir = repo()
    const service = new ReviewService(host([]).value)
    await service.anchorOf(path.join(dir, 'src', 'a.txt'))
    assert.deepEqual(service.knownRoots(), [git(dir, 'rev-parse', '--show-toplevel')])
  })
})
