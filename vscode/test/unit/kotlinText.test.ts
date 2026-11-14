import assert from 'node:assert/strict'

import { isKotlinBlank, kotlinTrim, kotlinTrimEnd } from '../../src/core/kotlinText'

describe('kotlinText', () => {
  it('trims the characters that Kotlin trims', () => {
    assert.equal(kotlinTrim('\u001f\u00a0 TODO \u3000\u2028'), 'TODO')
  })

  it('keeps the characters that Kotlin keeps', () => {
    assert.equal(kotlinTrim('\ufeffTODO\u0085'), '\ufeffTODO\u0085')
  })

  it('reads a line of Kotlin white space as blank', () => {
    assert.equal(isKotlinBlank(' \t\u001c\u00a0'), true)
    assert.equal(isKotlinBlank(''), true)
    assert.equal(isKotlinBlank('\ufeff'), false)
  })

  it('trims a trailing space at the end', () => assert.equal(kotlinTrimEnd('TODO  '), 'TODO'))

  it('trims a trailing no-break space at the end', () =>
    assert.equal(kotlinTrimEnd(`TODO${String.fromCharCode(0xa0)}`), 'TODO'))

  it('keeps a leading space at the end trim', () => assert.equal(kotlinTrimEnd('  TODO'), '  TODO'))
})
