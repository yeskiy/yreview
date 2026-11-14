import assert from 'node:assert/strict'

import { handleOf } from '../../../src/core/handles'
import { type CopyOutcome, collectPrompt } from '../../../src/handoff/copyCollect'
import { HandoffFiles } from '../../../src/handoff/handoffFiles'
import { type HandoffStore, handoffStores } from '../../../src/handoff/handoffWriter'
import { FirstScan } from '../../../src/tasks/scanRuns'
import { task } from '../tasks/fixtures'

const ROOT = 'E:/work/a'
const one = task({ id: '1'.repeat(40), rootPath: ROOT, text: 'Hand this over.' })

/** A copy as the command runs it: the stores of the task model, then the prompt. */
const copyAfter = (first: FirstScan, roots: { value: readonly string[] }) => {
  const written: HandoffStore[] = []
  const outcome = (async (): Promise<CopyOutcome> =>
    collectPrompt(
      [one],
      await handoffStores(() => first.after(() => roots.value), {
        folderStores: () => Promise.resolve([]),
      }),
      (store) => {
        written.push(store)
        return Promise.resolve({
          files: new HandoffFiles(`${store.root}/.git/y-review/vscode-a-1234abcd`),
          label: '.git/y-review/vscode-a-1234abcd',
          commit: 'c'.repeat(40),
        })
      },
    ))()
  return { outcome, written }
}

describe('first scan', () => {
  it('a copy that starts before the first scan ends waits for it and copies the task', async () => {
    const first = new FirstScan()
    const roots = { value: [] as readonly string[] }
    const copy = copyAfter(first, roots)
    await new Promise((resolve) => {
      setImmediate(resolve)
    })
    assert.deepEqual(copy.written, [])
    roots.value = [ROOT]
    first.settle()
    const outcome = await copy.outcome
    assert.deepEqual(copy.written, [{ kind: 'git', root: ROOT }])
    assert.deepEqual(outcome.unwritten, [])
    assert.ok(outcome.text.includes(handleOf(one.id)))
  })

  it('a failed first scan lets the copy go on, and the copy reports the folder', async () => {
    const first = new FirstScan()
    const copy = copyAfter(first, { value: [] })
    first.settle()
    const outcome = await copy.outcome
    assert.deepEqual(copy.written, [])
    assert.deepEqual(outcome.unwritten, ['a'])
  })

  it('a copy after the first scan does not wait', async () => {
    const first = new FirstScan()
    first.settle()
    first.settle()
    assert.deepEqual(await first.after(() => [ROOT]), [ROOT])
  })
})
