import assert from 'node:assert/strict'

import { handleOf } from '../../../src/core/handles'
import { collectPrompt } from '../../../src/handoff/copyCollect'
import { HandoffFiles } from '../../../src/handoff/handoffFiles'
import type { HandoffStore, WrittenHandoff } from '../../../src/handoff/handoffWriter'
import type { ReviewTask } from '../../../src/tasks/reviewTask'
import { task } from '../tasks/fixtures'

const A = 'E:/work/a'
const B = 'E:/work/b'
const NO_FILE = 'Name every finished identifier in your answer instead.'

const stores: readonly HandoffStore[] = [
  { kind: 'git', root: A },
  { kind: 'git', root: B },
]

const written = (folder: string): WrittenHandoff => ({
  files: new HandoffFiles(folder),
  label: '.git/y-review/vscode-r-1234abcd',
  commit: 'c'.repeat(40),
})

const recorder = () => {
  const calls: { store: HandoffStore; tasks: readonly ReviewTask[] }[] = []
  return {
    calls,
    write: (store: HandoffStore, tasks: readonly ReviewTask[]) => {
      calls.push({ store, tasks })
      return Promise.resolve(written(`${store.root}/.git/y-review/vscode-r-1234abcd`))
    },
  }
}

describe('copy collect', () => {
  it('groups the tasks by store in the order of the list', async () => {
    const a1 = task({ id: '1'.repeat(40), rootPath: A, text: 'First of a.' })
    const b1 = task({ id: '2'.repeat(40), rootPath: B, text: 'First of b.' })
    const a2 = task({ id: '3'.repeat(40), rootPath: A, text: 'Second of a.' })
    const { calls, write } = recorder()
    const outcome = await collectPrompt([a1, b1, a2], stores, write)
    const first = outcome.text.indexOf('Folder 1 of 2: a')
    const second = outcome.text.indexOf('Folder 2 of 2: b')
    assert.ok(first >= 0 && second > first)
    const folderOne = outcome.text.slice(first, second)
    assert.ok(folderOne.includes('First of a.'))
    assert.ok(folderOne.includes('Second of a.'))
    assert.ok(!folderOne.includes('First of b.'))
    assert.deepEqual(
      calls.map((call) => [call.store.root, call.tasks.map((each) => each.text)]),
      [
        [A, ['First of a.', 'Second of a.']],
        [B, ['First of b.']],
      ],
    )
    assert.equal(outcome.tasks, 3)
    assert.equal(outcome.folders, 2)
    assert.deepEqual(outcome.unwritten, [])
  })

  it('every task carries its short handle', async () => {
    const id = 'c3f9a12aabbccddeeff00112233445566778899a'
    const { calls, write } = recorder()
    const outcome = await collectPrompt([task({ id, rootPath: A })], stores, write)
    assert.ok(outcome.text.includes(handleOf(id)))
    assert.ok(!outcome.text.includes(id))
    assert.deepEqual(
      calls.flatMap((call) => call.tasks.map((each) => each.id)),
      [handleOf(id)],
    )
  })

  it('a store that left the window keeps its tasks and asks for an answer', async () => {
    const { calls, write } = recorder()
    const outcome = await collectPrompt(
      [task({ rootPath: 'E:/work/gone', text: 'Still here.' })],
      stores,
      write,
    )
    assert.deepEqual(outcome.unwritten, ['gone'])
    assert.ok(outcome.text.includes('Still here.'))
    assert.ok(outcome.text.includes(NO_FILE))
    assert.deepEqual(calls, [])
  })

  it('a failed write keeps the tasks and asks for an answer', async () => {
    const outcome = await collectPrompt(
      [task({ rootPath: A, text: 'Kept after a failure.' })],
      stores,
      () => Promise.resolve(undefined),
    )
    assert.deepEqual(outcome.unwritten, ['a'])
    assert.ok(outcome.text.includes('Kept after a failure.'))
    assert.ok(outcome.text.includes(NO_FILE))
  })

  it('the done path uses forward slashes', async () => {
    const outcome = await collectPrompt([task({ rootPath: A })], stores, () =>
      Promise.resolve(written('C:\\r\\.git\\y-review\\vscode-r-1234abcd')),
    )
    assert.ok(outcome.text.includes('C:/r/.git/y-review/vscode-r-1234abcd/done.txt'))
    assert.ok(!outcome.text.includes('\\done.txt'))
  })
})
