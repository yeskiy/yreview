import { strict as assert } from 'node:assert'

import { newToken, tokenMatches } from '../../../src/bridge/token'

describe('bridge token (BridgeTokenTest.kt)', () => {
  it('makes a token the channel accepts', () => assert.match(newToken(), /^[0-9a-f]{64}$/))
  it('makes a new token on every call', () => assert.notEqual(newToken(), newToken()))
  it('accepts the token it made', () => {
    const token = newToken()
    assert.equal(tokenMatches(token, token), true)
  })
  it('refuses another token of the same length', () =>
    assert.equal(tokenMatches(newToken(), newToken()), false))
  it('refuses a token that is missing', () =>
    assert.equal(tokenMatches(newToken(), undefined), false))
  it('refuses a token that is only a prefix', () => {
    const token = newToken()
    assert.equal(tokenMatches(token, token.slice(0, 32)), false)
  })
  it('refuses an empty token', () => assert.equal(tokenMatches(newToken(), ''), false))
  it('an empty token matches no empty token', () => assert.equal(tokenMatches('', ''), false))
  it('an empty token matches nothing at all', () =>
    assert.equal(tokenMatches('', newToken()), false))
})
