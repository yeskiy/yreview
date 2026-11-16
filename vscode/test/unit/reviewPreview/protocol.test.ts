import assert from 'node:assert/strict'

import { MAX_TEXT, fromWebview, stateOf } from '../../../src/reviewPreview/protocol'

const id = 'a'.repeat(40)

describe('the messages of the review preview page', () => {
  it('reads a valid save', () =>
    assert.deepEqual(
      fromWebview({ type: 'save', lines: { start: 2, end: 4 }, text: 'Hi', shared: false }),
      { type: 'save', lines: { start: 2, end: 4 }, text: 'Hi', shared: false },
    ))

  it('refuses a save with reversed, negative or broken lines', () => {
    assert.equal(
      fromWebview({ type: 'save', lines: { start: 4, end: 2 }, text: 'x', shared: false }),
      undefined,
    )
    assert.equal(
      fromWebview({ type: 'save', lines: { start: -1, end: 2 }, text: 'x', shared: false }),
      undefined,
    )
    assert.equal(
      fromWebview({ type: 'save', lines: { start: 1.5, end: 2 }, text: 'x', shared: false }),
      undefined,
    )
  })

  it('refuses a save with too much text or a shared flag that is not a boolean', () => {
    assert.equal(
      fromWebview({
        type: 'save',
        lines: { start: 0, end: 0 },
        text: 'x'.repeat(MAX_TEXT + 1),
        shared: false,
      }),
      undefined,
    )
    assert.equal(
      fromWebview({ type: 'save', lines: { start: 0, end: 0 }, text: 'x', shared: 'yes' }),
      undefined,
    )
  })

  it('reads an id of 40 hex digits only', () => {
    assert.deepEqual(fromWebview({ type: 'resolve', id }), { type: 'resolve', id })
    assert.equal(fromWebview({ type: 'delete', id: '../x' }), undefined)
  })

  it('reads the build number of a ready page, and only a whole number', () => {
    assert.deepEqual(fromWebview({ type: 'ready', build: 3 }), { type: 'ready', build: 3 })
    ;[-1, 1.5, '3', null].forEach((build) =>
      assert.deepEqual(fromWebview({ type: 'ready', build }), { type: 'ready' }, String(build)),
    )
  })

  it('drops unknown fields and unknown types', () => {
    assert.deepEqual(fromWebview({ type: 'ready', extra: 1 }), { type: 'ready' })
    assert.equal(fromWebview({ type: 'run', command: 'x' }), undefined)
    assert.equal(fromWebview(null), undefined)
  })

  it('reads a link only as a short string', () => {
    assert.deepEqual(fromWebview({ type: 'openLink', href: 'notes.md' }), {
      type: 'openLink',
      href: 'notes.md',
    })
    assert.equal(fromWebview({ type: 'openLink', href: 'x'.repeat(4097) }), undefined)
  })

  it('reads a restore state with a file URI only', () => {
    assert.deepEqual(stateOf({ uri: 'file:///e%3A/a.md', draft: 1 }), { uri: 'file:///e%3A/a.md' })
    assert.equal(stateOf({ uri: 'untitled:a' }), undefined)
    assert.equal(stateOf('x'), undefined)
  })
})
