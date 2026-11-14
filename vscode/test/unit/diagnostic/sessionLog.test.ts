import assert from 'node:assert/strict'

import { LIMIT, SessionLog } from '../../../src/diagnostic/sessionLog'
import { sendRecord } from '../../../src/diagnostic/sessionRecord'

const send = (tasks: number) =>
  sendRecord({ route: 'channel', store: 'git', readers: 1, tasks, batches: 1, dropped: 0 })

describe('the session log', () => {
  it('starts empty', () => assert.deepEqual(new SessionLog().recent(), []))

  it('gives the newest record first', () => {
    const ring = new SessionLog()
    ring.add(send(1))
    ring.add(send(2))
    assert.deepEqual(
      ring.recent().map((record) => record.facts[3]?.[1]),
      ['2', '1'],
    )
  })

  it('keeps the newest records only', () => {
    const ring = new SessionLog()
    Array.from({ length: LIMIT + 7 }, (_, index) => index).forEach((index) => ring.add(send(index)))
    assert.equal(ring.recent().length, LIMIT)
    assert.equal(ring.recent()[0]?.facts[3]?.[1], String(LIMIT + 6))
    assert.equal(ring.recent()[LIMIT - 1]?.facts[3]?.[1], '7')
  })
})
