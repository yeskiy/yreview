import { strict as assert } from 'node:assert'

import { drainEvents } from '../../../src/channel/bridgeClient'

describe('channel event drain (DrainEventsTest.kt)', () => {
  it('takes one whole event and keeps the rest', () => {
    assert.deepEqual(drainEvents('data: one\n\ndata: par'), { events: ['one'], rest: 'data: par' })
  })

  it('joins the data lines of one event', () => {
    assert.deepEqual(drainEvents('data: one\ndata: two\n\n'), { events: ['one\ntwo'], rest: '' })
  })

  it('drops a comment line and an empty event', () => {
    assert.deepEqual(drainEvents(': open\n\ndata: one\n\n').events, ['one'])
  })

  it('reads a stream that ends its lines with a carriage return', () => {
    assert.deepEqual(drainEvents('data: one\r\n\r\ndata: two\r\n\r\n').events, ['one', 'two'])
  })

  it('removes one space after the colon only', () => {
    assert.deepEqual(drainEvents('data:  two spaces\n\n').events, [' two spaces'])
  })
})
