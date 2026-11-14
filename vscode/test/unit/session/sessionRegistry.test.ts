import assert from 'node:assert/strict'

import { CHANNEL, NO_REACH, type SessionReach } from '../../../src/session/sessionReach'
import { SessionRegistry } from '../../../src/session/sessionRegistry'

const A = 'aaaaaaaaaaaaaaaa'
const B = 'bbbbbbbbbbbbbbbb'
const C = 'cccccccccccccccc'

const local: SessionReach = { kind: 'localHttp', port: 47821, password: 's3cret' }

describe('session registry', () => {
  const fresh = (): SessionRegistry => new SessionRegistry()

  it('an added session keeps its order', () => {
    const registry = fresh()
    registry.add(A, 'Claude 1')
    registry.add(B, 'Claude 2')
    assert.deepEqual(registry.entries(), [
      { key: A, name: 'Claude 1', reach: CHANNEL },
      { key: B, name: 'Claude 2', reach: CHANNEL },
    ])
  })

  it('a second add of one key replaces the name', () => {
    const registry = fresh()
    registry.add(A, 'Claude 1')
    registry.add(A, 'Claude 9')
    assert.deepEqual(registry.entries(), [{ key: A, name: 'Claude 9', reach: CHANNEL }])
  })

  it('a rename keeps the place of the session', () => {
    const registry = fresh()
    registry.add(A, 'Claude 1')
    registry.add(B, 'Claude 2')
    registry.rename(A, 'Claude 7')
    assert.equal(registry.nameOf(A), 'Claude 7')
    assert.deepEqual(
      registry.entries().map((entry) => entry.name),
      ['Claude 7', 'Claude 2'],
    )
  })

  it('a rename of a key that left changes nothing', () => {
    const registry = fresh()
    registry.rename(C, 'Claude 4')
    assert.deepEqual(registry.entries(), [])
  })

  it('a removed session is gone', () => {
    const registry = fresh()
    registry.add(A, 'Claude 1')
    registry.remove(A)
    assert.deepEqual(registry.entries(), [])
    assert.equal(registry.nameOf(A), undefined)
  })

  it('a session reaches the bridge through the channel unless the caller says otherwise', () => {
    const registry = fresh()
    registry.add(A, 'Claude 1')
    assert.deepEqual(registry.reachOf(A), CHANNEL)
  })

  it('a session keeps the reach the caller gave it', () => {
    const registry = fresh()
    registry.add(B, 'OpenCode 1', local)
    assert.deepEqual(registry.reachOf(B), local)
  })

  it('nothing reaches a session the registry does not hold', () => {
    assert.deepEqual(fresh().reachOf(C), NO_REACH)
  })

  it('a rename keeps the reach', () => {
    const registry = fresh()
    registry.add(B, 'OpenCode 1', local)
    registry.rename(B, 'OpenCode 3')
    assert.equal(registry.nameOf(B), 'OpenCode 3')
    assert.deepEqual(registry.reachOf(B), local)
  })

  it('a new reach keeps the place and the name of the session', () => {
    const registry = fresh()
    registry.add(A, 'Claude 1', NO_REACH)
    registry.add(B, 'Claude 2', NO_REACH)
    registry.setReach(A, local)
    assert.deepEqual(
      registry.entries().map((entry) => entry.name),
      ['Claude 1', 'Claude 2'],
    )
    assert.deepEqual(registry.reachOf(A), local)
  })

  it('a new reach for a key that left changes nothing', () => {
    const registry = fresh()
    registry.setReach(C, CHANNEL)
    assert.deepEqual(registry.entries(), [])
  })

  it('a listener hears every change and a removed listener hears nothing', () => {
    const registry = fresh()
    const heard = { count: 0 }
    const stop = registry.onDidChange(() => {
      heard.count += 1
    })
    registry.add(A, 'Claude 1')
    registry.rename(A, 'Claude 2')
    registry.setReach(A, NO_REACH)
    registry.remove(A)
    assert.equal(heard.count, 4)
    stop()
    registry.add(B, 'Claude 3')
    assert.equal(heard.count, 4)
  })
})
