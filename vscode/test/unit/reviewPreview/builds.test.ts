import assert from 'node:assert/strict'

import { MAX_RESENDS, NO_BUILD, answerOf, resend } from '../../../src/reviewPreview/builds'

const built = { build: 3, html: '<p>3</p>', resends: 0 }

describe('the page builds of the review preview', () => {
  it('accepts a ready page of the last build, or a page without a build number', () => {
    assert.equal(answerOf(built, { type: 'ready', build: 3 }), 'accept')
    assert.equal(answerOf(built, { type: 'ready' }), 'accept')
  })

  it('sends the last HTML again to a ready page of an old build', () =>
    assert.equal(answerOf(built, { type: 'ready', build: 2 }), 'resend'))

  it('sends the last HTML again when the page of the last build stays hidden', () =>
    assert.equal(answerOf(built, { type: 'stalled', build: 3 }), 'resend'))

  it('ignores a hidden page of an old build, because the last build replaces it', () =>
    assert.equal(answerOf(built, { type: 'stalled', build: 2 }), 'ignore'))

  it('ignores a page report before the first build', () => {
    assert.equal(answerOf(NO_BUILD, { type: 'ready', build: 1 }), 'ignore')
    assert.equal(answerOf(NO_BUILD, { type: 'stalled', build: 1 }), 'ignore')
  })

  it('stops after the last resend, so that a page that never shows cannot loop', () => {
    const spent = { ...built, resends: MAX_RESENDS }
    assert.equal(answerOf(spent, { type: 'stalled', build: 3 }), 'ignore')
    assert.equal(answerOf(spent, { type: 'ready', build: 2 }), 'ignore')
    assert.equal(answerOf(spent, { type: 'ready', build: 3 }), 'accept')
  })

  it('makes each resend differ from the HTML before it, and keeps the build', () => {
    const first = resend(built)
    const second = resend(first.built)
    assert.deepEqual(first.built, { ...built, resends: 1 })
    assert.notEqual(first.html, built.html)
    assert.notEqual(second.html, first.html)
    assert.ok(second.html.startsWith(built.html))
    assert.equal(second.built.build, 3)
  })
})
