import { strict as assert } from 'node:assert'

import { CLIPBOARD_REASONS, sendRouteOf } from '../../../src/bridge/sendReport'

describe('send route (SendRoutesTest.kt)', () => {
  it('a switch that is off beats every count', () => {
    assert.equal(sendRouteOf(false, 3, true), 'channelOff')
    assert.equal(sendRouteOf(false, 0, true), 'channelOff')
  })

  it('a folder that no git repository holds beats every count', () => {
    assert.equal(sendRouteOf(true, 3, false), 'noRepository')
    assert.equal(sendRouteOf(false, 0, false), 'noRepository')
  })

  it('one receiver is enough for the channel route', () =>
    assert.equal(sendRouteOf(true, 1, true), 'channel'))

  it('no receiver falls to the clipboard', () =>
    assert.equal(sendRouteOf(true, 0, true), 'noSession'))

  it('one opencode session and no event stream still takes the channel route', () =>
    assert.equal(sendRouteOf(true, 1, true), 'channel'))

  it('a stream that takes no push counts as no receiver', () =>
    assert.equal(sendRouteOf(true, 0, true), 'noSession'))

  it('only the channel route hides the reason', () => {
    assert.equal(CLIPBOARD_REASONS.channel, undefined)
    assert.equal(CLIPBOARD_REASONS.noSession, 'No session reads this project')
    assert.equal(CLIPBOARD_REASONS.channelOff, 'The review channel is off in the settings')
    assert.equal(
      CLIPBOARD_REASONS.noRepository,
      'The review channel carries the tasks of a git repository only',
    )
  })
})
