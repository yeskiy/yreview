import assert from 'node:assert/strict'
import { setTimeout as wait } from 'node:timers/promises'

import { DelayedWork } from '../../../src/tasks/scanRuns'

const pushing = (done: string[], name: string) => (): Promise<void> => {
  done.push(name)
  return Promise.resolve()
}

const unexpected = (error: unknown): void => assert.fail(String(error))

describe('DelayedWork', () => {
  it('runs a work after its delay', async () => {
    const done: string[] = []
    new DelayedWork(unexpected).later('a', pushing(done, 'a'), 10)
    assert.deepEqual(done, [])
    await wait(50)
    assert.deepEqual(done, ['a'])
  })

  it('a newer work of one name replaces the waiting one', async () => {
    const done: string[] = []
    const work = new DelayedWork(unexpected)
    work.later('a', pushing(done, 'old'), 10)
    work.later('a', pushing(done, 'new'), 10)
    await wait(50)
    assert.deepEqual(done, ['new'])
  })

  it('runs the waiting works of one prefix at once, and only once', async () => {
    const done: string[] = []
    const work = new DelayedWork(unexpected)
    work.later('edit a', pushing(done, 'edit a'), 10_000)
    work.later('changes', pushing(done, 'changes'), 10)
    await work.now('edit ')
    assert.deepEqual(done, ['edit a'])
    await wait(50)
    assert.deepEqual(done, ['edit a', 'changes'])
    work.cancel()
  })

  it('gives a failed work to the handler', async () => {
    const failures: unknown[] = []
    const work = new DelayedWork((error) => failures.push(error))
    work.later('a', () => Promise.reject(new Error('no')), 10_000)
    await work.now('a')
    assert.equal((failures[0] as Error).message, 'no')
  })

  it('a cancel stops every waiting work', async () => {
    const done: string[] = []
    const work = new DelayedWork(unexpected)
    work.later('a', pushing(done, 'a'), 10)
    work.cancel()
    await wait(50)
    await work.now('')
    assert.deepEqual(done, [])
  })
})
