import assert from 'node:assert/strict'

import {
  type AgentAnswer,
  AgentScan,
  NOT_YET,
  anyFound,
  installOf,
} from '../../../src/session/agentScan'

const found: AgentAnswer = {
  installs: new Map([['claude', { path: '/usr/bin/claude', source: 'path' }]]),
  scanned: true,
}

describe('agent scan', () => {
  it('answers not yet before the first search', () => {
    assert.equal(new AgentScan(() => Promise.resolve(found)).latest(), NOT_YET)
  })

  it('a call during a search starts no second search and still hears the answer', async () => {
    const calls = { count: 0 }
    const scan = new AgentScan(() => {
      calls.count += 1
      return Promise.resolve(found)
    })
    const [one, two] = await Promise.all([scan.refresh(), scan.refresh()])
    assert.equal(calls.count, 1)
    assert.equal(one, found)
    assert.equal(two, found)
    assert.equal(scan.latest(), found)
  })

  it('a failed search answers that the search ran and found nothing', async () => {
    const answer = await new AgentScan(() => Promise.reject(new Error('no disk'))).refresh()
    assert.equal(answer.scanned, true)
    assert.equal(anyFound(answer), false)
    assert.deepEqual(installOf(answer, 'claude'), { source: 'none' })
  })

  it('a later call runs a fresh search', async () => {
    const calls = { count: 0 }
    const scan = new AgentScan(() => {
      calls.count += 1
      return Promise.resolve(found)
    })
    await scan.refresh()
    await scan.refresh()
    assert.equal(calls.count, 2)
  })
})
