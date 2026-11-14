import { strict as assert } from 'node:assert'

import { lossLine } from '../../../src/bridge/server'
import { STOP, StreamQueue } from '../../../src/bridge/streamQueue'

describe('stream queue (StreamQueueTest.kt, BridgeQueueTest.kt)', () => {
  it('a queue keeps the events up to the bound', async () => {
    const queue = new StreamQueue(3)
    ;['a', 'b', 'c'].forEach((event) => queue.add(event))
    assert.deepEqual(
      [await queue.next(10), await queue.next(10), await queue.next(10)],
      ['a', 'b', 'c'],
    )
  })

  it('a full queue counts every event beyond the bound', () => {
    const queue = new StreamQueue(2)
    ;['a', 'b', 'c', 'd'].forEach((event) => queue.add(event))
    assert.equal(queue.takeLoss(), 2)
  })

  it('a queue that holds every event counts no loss', () => {
    const queue = new StreamQueue(2)
    queue.add('a')
    assert.equal(queue.takeLoss(), 0)
  })

  it('a queue gives one loss one time', () => {
    const queue = new StreamQueue(1)
    queue.add('a')
    queue.add('b')
    assert.deepEqual([queue.takeLoss(), queue.takeLoss()], [1, 0])
  })

  it('a queue that takes the stop event drops the events it holds', async () => {
    const queue = new StreamQueue()
    queue.add('a')
    queue.add('b')
    queue.replaceWith(STOP)
    assert.equal(await queue.next(10), STOP)
  })

  it('a waiting reader takes the next event at once', async () => {
    const queue = new StreamQueue()
    const started = Date.now()
    const waiting = queue.next(5000)
    queue.add('a')
    assert.equal(await waiting, 'a')
    assert.ok(Date.now() - started < 100)
  })

  it('a waiting reader gets nothing after the wait', async () => {
    assert.equal(await new StreamQueue().next(50), undefined)
  })

  it('the line of a loss names the number of events', () =>
    assert.equal(
      lossLine(3),
      ': the bridge dropped 3 events for this session, because it read none\n\n',
    ))

  it('the line of one lost event names one event', () =>
    assert.equal(
      lossLine(1),
      ': the bridge dropped 1 event for this session, because it read none\n\n',
    ))
})
