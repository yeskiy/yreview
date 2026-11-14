import assert from 'node:assert/strict'

import {
  KEY_BYTES,
  MAX_LENGTH,
  SESSION_HEADER,
  SESSION_KEY_VARIABLE,
  isValidSessionKey,
  newSessionKey,
} from '../../../src/session/sessionKey'

describe('session key', () => {
  it('a key holds hexadecimal characters only', () => {
    const key = newSessionKey()
    assert.equal(key.length, KEY_BYTES * 2)
    assert.match(key, /^[0-9a-f]+$/)
  })

  it('two keys differ', () => {
    assert.notEqual(newSessionKey(), newSessionKey())
  })

  it('a fresh key passes the check', () => {
    assert.ok(isValidSessionKey(newSessionKey()))
  })

  it('the check refuses a value that no session could have made', () => {
    assert.ok(!isValidSessionKey(undefined))
    assert.ok(!isValidSessionKey(''))
    assert.ok(!isValidSessionKey('short'))
    assert.ok(!isValidSessionKey('a'.repeat(MAX_LENGTH + 1)))
    assert.ok(!isValidSessionKey('has a space here'))
    assert.ok(!isValidSessionKey('holds\na line break'))
  })

  it('the check refuses a value that could break a log line', () => {
    assert.ok(!isValidSessionKey('carriage\rreturn0'))
    assert.ok(!isValidSessionKey('a-tab\tinside00'))
  })

  it('the two names of the contract stay as they are', () => {
    assert.equal(SESSION_KEY_VARIABLE, 'Y_REVIEW_SESSION_KEY')
    assert.equal(SESSION_HEADER, 'X-Y-Review-Session')
  })
})
