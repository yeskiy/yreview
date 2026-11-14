import assert from 'node:assert/strict'

import { cleanName } from '../../../src/session/sessionNaming'
import {
  MAX_SESSIONS,
  apart,
  canOpen,
  freeNumber,
  sessionName,
} from '../../../src/session/sessionRules'

describe('session rules', () => {
  it('the first tab takes the number one', () => {
    assert.equal(freeNumber(new Set()), 1)
  })

  it('a new tab takes the smallest number that no open tab holds', () => {
    assert.equal(freeNumber(new Set([1, 3])), 2)
    assert.equal(freeNumber(new Set([1, 2, 3])), 4)
    assert.equal(freeNumber(new Set([2, 3])), 1)
  })

  it('the window opens no tab over the stream limit of the bridge', () => {
    assert.equal(MAX_SESSIONS, 16)
    assert.ok(canOpen(0))
    assert.ok(canOpen(MAX_SESSIONS - 1))
    assert.ok(!canOpen(MAX_SESSIONS))
    assert.ok(!canOpen(MAX_SESSIONS + 1))
  })

  it('the sixteenth tab opens and the seventeenth does not', () => {
    assert.ok(canOpen(15))
    assert.equal(freeNumber(new Set(Array.from({ length: 15 }, (_, index) => index + 1))), 16)
    assert.ok(!canOpen(16))
  })

  it('the built name carries the short name of the agent', () => {
    assert.equal(sessionName({ number: 2, agent: 'Claude' }), 'Claude 2')
    assert.equal(sessionName({ number: 1, agent: 'Aider' }), 'Aider 1')
  })

  it('a tab with no agent reads the plain stem', () => {
    assert.equal(sessionName({ number: 1 }), 'Session 1')
  })

  it('the name of the agent stands alone', () => {
    assert.equal(
      sessionName({ number: 2, agent: 'Claude', byAgent: 'fix the parser' }),
      'fix the parser',
    )
  })

  it('the name of the agent beats the name of the user', () => {
    assert.equal(
      sessionName({ number: 2, agent: 'Claude', byAgent: 'fix the parser', byUser: 'my notes' }),
      'fix the parser',
    )
  })

  it('the name of the user beats the built name', () => {
    assert.equal(sessionName({ number: 2, agent: 'Codex', byUser: 'my notes' }), 'my notes')
  })

  it('a blank given name is no name', () => {
    assert.equal(sessionName({ number: 2, agent: 'Codex', byUser: '   ' }), 'Codex 2')
    assert.equal(sessionName({ number: 2, agent: 'Codex', byAgent: '' }), 'Codex 2')
  })

  it('names that differ are left alone', () => {
    assert.deepEqual(apart(['Claude 1', 'Codex 2']), ['Claude 1', 'Codex 2'])
  })

  it('a repeated name takes a number so the picker stays readable', () => {
    assert.deepEqual(apart(['fix the parser', 'fix the parser']), [
      'fix the parser (1)',
      'fix the parser (2)',
    ])
  })

  it('only the repeated names take a number', () => {
    assert.deepEqual(apart(['a', 'b', 'a']), ['a (1)', 'b', 'a (2)'])
  })

  it('an empty list stays empty', () => {
    assert.deepEqual(apart([]), [])
  })

  it('a tab carries the short name of its agent', () => {
    assert.equal(sessionName({ number: 1, agent: 'Claude' }), 'Claude 1')
  })

  it('a tab of a project with no chosen agent carries the plain stem', () => {
    assert.equal(sessionName({ number: 1, agent: undefined }), 'Session 1')
  })

  it('the name that the user typed reaches the tab', () => {
    assert.equal(
      sessionName({ number: 1, agent: 'Aider', byUser: cleanName('my notes') }),
      'my notes',
    )
  })

  it('an empty answer brings the built name back', () => {
    assert.equal(sessionName({ number: 1, agent: 'Aider', byUser: cleanName('  ') }), 'Aider 1')
  })

  it('the name of the agent stands over the name of the user', () => {
    assert.equal(
      sessionName({ number: 1, agent: 'Aider', byAgent: 'fix the parser', byUser: 'my notes' }),
      'fix the parser',
    )
  })
})
