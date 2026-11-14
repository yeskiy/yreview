import assert from 'node:assert/strict'

import { ScanRuns } from '../../../src/tasks/scanRuns'

describe('ScanRuns', () => {
  it('a scan that runs to the end gives its rows', async () => {
    const runs = new ScanRuns()
    const outcome = await runs.run(runs.next(), () => Promise.resolve('rows'))
    assert.equal(outcome?.rows, 'rows')
    assert.equal(outcome?.failure, undefined)
  })

  it('a newer scan cancels the older one', () => {
    const runs = new ScanRuns()
    const older = runs.next()
    const newer = runs.next()
    assert.equal(older.aborted, true)
    assert.equal(newer.aborted, false)
  })

  it('a scan that a newer scan cancels on its way gives nothing', async () => {
    const runs = new ScanRuns()
    const older = runs.next()
    const reads: string[] = []
    const outcome = await runs.run(older, () => {
      reads.push('first step')
      runs.next()
      older.throwIfAborted()
      reads.push('second step')
      return Promise.resolve('rows')
    })
    assert.equal(outcome, undefined)
    assert.deepEqual(reads, ['first step'])
  })

  it('a scan that ends after its cancel gives nothing', async () => {
    const runs = new ScanRuns()
    const older = runs.next()
    assert.equal(
      await runs.run(older, () => {
        runs.next()
        return Promise.resolve('rows')
      }),
      undefined,
    )
  })

  it('a closed view cancels its open scan', () => {
    const runs = new ScanRuns()
    const open = runs.next()
    runs.cancel()
    assert.equal(open.aborted, true)
  })
})
