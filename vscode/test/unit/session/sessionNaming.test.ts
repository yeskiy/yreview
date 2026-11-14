import assert from 'node:assert/strict'

import { MAX_NAME, cleanName } from '../../../src/session/sessionNaming'

describe('session naming', () => {
  it('a typed name loses the spaces at both ends', () => {
    assert.equal(cleanName('  my notes  '), 'my notes')
  })

  it('an empty answer clears the name', () => {
    assert.equal(cleanName(''), undefined)
    assert.equal(cleanName('   '), undefined)
  })

  it('an absent answer clears the name', () => {
    assert.equal(cleanName(undefined), undefined)
  })

  it('a name of many lines becomes one line', () => {
    assert.equal(cleanName('one\ntwo'), 'one two')
    assert.equal(cleanName('one\r\ntwo'), 'one two')
    assert.equal(cleanName('one \t two'), 'one two')
  })

  it('a name over the limit is cut to the limit', () => {
    assert.equal(cleanName('x'.repeat(MAX_NAME + 20))?.length, MAX_NAME)
  })
})
