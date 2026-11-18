import { strict as assert } from 'node:assert'
import path from 'node:path'

import { handleOf } from '../../../src/core/handles'
import { encodeRecord, recordId } from '../../../src/core/record'
import { inWorkspace } from '../../../src/mcp/reviewTools'
import { DISCUSS, LOCAL } from '../../../src/store/noteRefs'
import { COMMIT_A, COMMIT_B, WORKTREE, toolFixture } from './toolFixture'

type Fixture = ReturnType<typeof toolFixture>

const RANGE = { startLine: 3, endLine: 5 }
const NOTE_KEY = [DISCUSS, COMMIT_A].join(String.fromCharCode(0))

const ids = (payload: unknown): readonly string[] =>
  (payload as { comments: readonly { id: string }[] }).comments.map((row) => row.id).sort()

describe('inWorkspace', () => {
  it('keeps the roots above, at and inside a workspace folder', () => {
    assert.deepEqual(inWorkspace(['C:/w', 'C:/w/sub', 'C:/', 'C:/other', 'C:/wide'], ['C:/w']), [
      'C:/w',
      'C:/w/sub',
      'C:/',
    ])
  })
})

describe('review tools (ReviewToolset.kt)', () => {
  const held: { fixture?: Fixture } = {}
  const fixture = (): Fixture => {
    assert.ok(held.fixture)
    return held.fixture
  }

  beforeEach(() => {
    held.fixture = toolFixture()
  })

  afterEach(() => {
    held.fixture?.dispose()
  })

  const seed = async () => {
    const { git, folder } = fixture()
    const shared = await git.book.add(DISCUSS, COMMIT_A, 'src/a.ts', RANGE, 'Fix the shared one.')
    const local = await git.book.add(LOCAL, COMMIT_A, 'src/a.ts', RANGE, 'Fix the local one.')
    const done = await git.book.add(DISCUSS, COMMIT_A, 'src/a.ts', RANGE, 'Fixed already.')
    await git.book.resolve(done)
    const inFolder = await folder.book.add(DISCUSS, WORKTREE, 'src/b.ts', RANGE, 'Fix the folder.')
    return { shared, local, done, inFolder }
  }

  it('lists the open comments of every store', async () => {
    const { shared, local, inFolder } = await seed()
    const payload = await fixture().tools.list()
    assert.deepEqual(ids(payload), [shared, local, inFolder].map((s) => handleOf(s.id)).sort())
    const folderRow = (payload.comments as readonly { id: string; shared: boolean }[]).find(
      (row) => row.id === handleOf(inFolder.id),
    )
    assert.equal(folderRow?.shared, false)
  })

  it('lists the resolved comments when asked', async () => {
    const { done } = await seed()
    const payload = await fixture().tools.list(true)
    assert.deepEqual(ids(payload), [handleOf(done.id)])
    assert.equal((payload.comments as readonly { resolved: boolean }[])[0]?.resolved, true)
  })

  it('leaves out the local comments when asked', async () => {
    const { shared, inFolder } = await seed()
    const payload = await fixture().tools.list(false, false, false)
    assert.deepEqual(ids(payload), [shared, inFolder].map((s) => handleOf(s.id)).sort())
  })

  it('resolves a comment by its handle', async () => {
    const { shared } = await seed()
    const { tools, git, gitNotes, calls } = fixture()
    const handle = handleOf(shared.id)
    const before = gitNotes.notes.get(NOTE_KEY)?.length ?? 0
    assert.deepEqual(await tools.resolveComment(handle), { id: handle, resolved: true })
    assert.equal(gitNotes.notes.get(NOTE_KEY)?.length, before + 1)
    assert.ok((await git.book.closed(COMMIT_A, [DISCUSS])).some((s) => s.id === shared.id))
    assert.equal(calls.changed, 1)
  })

  it('names an unknown id', async () => {
    await seed()
    assert.deepEqual(await fixture().tools.resolveComment('yzzzz'), {
      error: 'No review comment has the id yzzzz.',
    })
    assert.equal(fixture().calls.changed, 0)
  })

  it('names a handle that two comments share', async () => {
    // These two timestamps give two ids with the same first 8 hex characters.
    const records = ['1755643473', '1755652925'].map((timestamp) => ({
      timestamp,
      author: 'dev@example.com',
      description: 'Check this.',
      location: { commit: COMMIT_A, path: 'src/a.ts', range: RANGE },
    }))
    const { gitNotes, tools } = fixture()
    gitNotes.notes.set(NOTE_KEY, records.map(encodeRecord))
    const [first, second] = records.map((record) => handleOf(recordId(record)))
    assert.equal(first, second)
    assert.deepEqual(await tools.resolveComment(first ?? ''), {
      error: `The id ${first} names 2 comments. Call review_list_comments and use a full id.`,
    })
  })

  it('refuses a range with a start line below 1', async () => {
    assert.deepEqual(await fixture().tools.addComment('src/a.ts', 0, 2, 'x'), {
      error: 'startLine must be 1 or more.',
    })
  })

  it('refuses an end line that a record cannot hold', async () => {
    assert.deepEqual(await fixture().tools.addComment('src/a.ts', 1, 3_000_000_000, 'x'), {
      error: 'endLine must be 2147483647 or less.',
    })
  })

  it('refuses an empty text', async () => {
    assert.deepEqual(await fixture().tools.addComment('src/a.ts', 1, 2, '  \n'), {
      error: 'text must not be empty.',
    })
  })

  it('refuses a path that leaves the project', async () => {
    const { tools, calls } = fixture()
    assert.deepEqual(await tools.addComment('../x', 1, 1, 'x'), {
      error: 'The path ../x is not a path inside the project.',
    })
    assert.deepEqual(calls.anchorOf, [])
  })

  it('adds a comment to the store of the file', async () => {
    const { tools, calls, gitRoot } = fixture()
    const payload = await tools.addComment('./src\\a.ts', 2, 4, 'Rename this.')
    assert.equal(calls.add.length, 1)
    const [added] = calls.add
    assert.deepEqual(added?.range, { startLine: 2, endLine: 4 })
    assert.equal(added?.shared, true)
    assert.equal(added?.text, 'Rename this.')
    assert.equal(added?.anchor.root, gitRoot)
    assert.deepEqual(calls.anchorOf, [path.resolve(gitRoot, 'src/a.ts')])
    const written = await fixture().git.book.open(COMMIT_A, [DISCUSS])
    assert.equal(written.length, 1)
    assert.deepEqual(payload, {
      id: handleOf(written[0]?.id ?? ''),
      path: 'src/a.ts',
      revision: COMMIT_A,
      shared: true,
    })
  })

  it('refuses an anchor whose root is outside the workspace', async () => {
    const { tools, calls, state } = fixture()
    state.anchorRoot = path.resolve('/outside-the-workspace')
    assert.deepEqual(await tools.addComment('src/a.ts', 1, 1, 'x'), {
      error: 'The project holds no review store for src/a.ts.',
    })
    assert.deepEqual(calls.add, [])
  })

  it('names a file the workspace does not hold', async () => {
    const { tools, calls } = fixture()
    assert.deepEqual(await tools.addComment('src/none.ts', 1, 1, 'x'), {
      error: 'The project holds no file at src/none.ts.',
    })
    assert.deepEqual(calls.anchorOf, [])
  })

  it('opens a comment of the head commit as a file', async () => {
    const { shared } = await seed()
    const { tools, calls, gitRoot } = fixture()
    const handle = handleOf(shared.id)
    assert.deepEqual(await tools.openComment(handle), {
      id: handle,
      opened: 'file',
      path: 'src/a.ts',
      line: 3,
      revision: COMMIT_A,
    })
    assert.deepEqual(calls.showFile, [{ file: path.resolve(gitRoot, 'src/a.ts'), line: 3 }])
    assert.deepEqual(calls.showDiff, [])
  })

  it('opens a comment of an older commit as a diff', async () => {
    const { tools, calls, git, gitRoot } = fixture()
    const old = await git.book.add(DISCUSS, COMMIT_B, 'src/a.ts', RANGE, 'Old one.')
    const handle = handleOf(old.id)
    assert.deepEqual(await tools.openComment(handle), {
      id: handle,
      opened: 'diff',
      path: 'src/a.ts',
      line: 3,
      revision: COMMIT_B,
    })
    assert.deepEqual(calls.showDiff, [
      { root: gitRoot, path: 'src/a.ts', revision: COMMIT_B, line: 3 },
    ])
    assert.deepEqual(calls.showFile, [])
  })

  it('opens the file when the older revision cannot be shown', async () => {
    const { tools, calls, git, gitRoot, state } = fixture()
    state.diffShown = false
    const old = await git.book.add(DISCUSS, COMMIT_B, 'src/a.ts', RANGE, 'Old one.')
    const payload = await tools.openComment(old.id)
    assert.equal(calls.showDiff.length, 1)
    assert.deepEqual(calls.showFile, [{ file: path.resolve(gitRoot, 'src/a.ts'), line: 3 }])
    assert.equal(payload.opened, 'file')
  })

  it('refuses a comment whose path leaves its repository', async () => {
    const { tools, calls, git } = fixture()
    const outside = await git.book.add(DISCUSS, COMMIT_B, '../outside.ts', RANGE, 'Outside.')
    const handle = handleOf(outside.id)
    assert.deepEqual(await tools.openComment(handle), {
      error: `The comment ${handle} names a file outside its repository. VS Code opens nothing.`,
    })
    assert.deepEqual(calls.showFile, [])
    assert.deepEqual(calls.showDiff, [])
  })
})
