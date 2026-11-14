import assert from 'node:assert/strict'

import { agentOf } from '../../../src/session/catalog'
import {
  CHANNEL,
  NO_REACH,
  type SessionReach,
  describeReach,
  reachOf,
  takesSend,
} from '../../../src/session/sessionReach'

const local = (port: number, password: string): SessionReach => ({
  kind: 'localHttp',
  port,
  password,
})

describe('session reach', () => {
  it('a channel session takes a send only while its stream is open', () => {
    assert.equal(takesSend(CHANNEL, true), true)
    assert.equal(takesSend(CHANNEL, false), false)
  })

  it('a session with a port of its own takes a send with no stream', () => {
    const reach = local(47821, 's3cret')
    assert.equal(takesSend(reach, false), true)
    assert.equal(takesSend(reach, true), true)
  })

  it('a session that takes no send is never a target', () => {
    assert.equal(takesSend(NO_REACH, true), false)
    assert.equal(takesSend(NO_REACH, false), false)
  })

  it('the password never reaches a log', () => {
    assert.equal(describeReach(local(47821, 'the-secret-value')), 'LocalHttp(port=47821)')
  })

  it('claude code is reached through the channel', () => {
    assert.deepEqual(reachOf(agentOf('claude')), CHANNEL)
  })

  it('opencode is reached on its own loopback port', () => {
    assert.deepEqual(reachOf(agentOf('opencode'), 47821, 's3cret'), local(47821, 's3cret'))
  })

  it('opencode without a port or a password is reached by nothing', () => {
    const opencode = agentOf('opencode')
    assert.deepEqual(reachOf(opencode), NO_REACH)
    assert.deepEqual(reachOf(opencode, 47821), NO_REACH)
    assert.deepEqual(reachOf(opencode, undefined, 's3cret'), NO_REACH)
  })

  it('an agent that takes no push is reached by nothing', () => {
    ;(['codex', 'gemini', 'custom', 'none'] as const).forEach((id) =>
      assert.deepEqual(reachOf(agentOf(id)), NO_REACH, id),
    )
  })

  it('a reach built from an agent never prints the password', () => {
    const text = describeReach(reachOf(agentOf('opencode'), 47821, 'the-secret-value'))
    assert.ok(!text.includes('the-secret-value'), text)
  })
})
