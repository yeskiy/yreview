import assert from 'node:assert/strict'

import { cleanPath, cleanText, cutText, isAnyControl, isControl } from '../../../src/tasks/taskText'

// A person pastes the prompt into a terminal, so an escape sequence must not reach it.
const escape = String.fromCharCode(27)
const bell = String.fromCharCode(7)
const del = String.fromCharCode(127)
const introducer = String.fromCharCode(0x9b)
const wide = String.fromCodePoint(0x1f680)

describe('task text', () => {
  it('a plain text stays as it is', () => {
    assert.equal(cleanText('fix the parser'), 'fix the parser')
  })

  it('an escape sequence goes out', () => {
    assert.equal(cleanText(`${escape}[31mred${escape}[0m`), '[31mred[0m')
  })

  it('the lines of a comment stay whole', () => {
    const text = `${['one', 'two', 'three'].join('\n')}\r\nfour\tfive`
    assert.equal(cleanText(text), text)
  })

  it('the bell and the delete character go out', () => {
    assert.equal(cleanText(`a${bell}${del}b`), 'ab')
  })

  it('the second range of control characters goes out', () => {
    assert.equal(cleanText(`a${introducer}b`), 'ab')
    assert.equal(cleanText(`a${String.fromCharCode(0x80, 0x85, 0x9f)}b`), 'ab')
    assert.equal(cleanPath(`a${introducer}b`), 'ab')
  })

  it('the character after that range stays', () => {
    const plain = `a${String.fromCharCode(0xa0)}b${String.fromCharCode(0xa1)}`
    assert.equal(cleanText(plain), plain)
    assert.equal(cleanPath(plain), plain)
  })

  it('the rule names every control character it drops', () => {
    assert.equal(isControl(escape), true)
    assert.equal(isControl(String.fromCharCode(0)), true)
    assert.equal(isControl(del), true)
    assert.equal(isControl(introducer), true)
    assert.equal(isControl(String.fromCharCode(0xa0)), false)
    assert.equal(isControl('\n'), false)
    assert.equal(isControl('\r'), false)
    assert.equal(isControl('\t'), false)
    assert.equal(isControl('a'), false)
  })

  it('a path keeps no control character at all', () => {
    assert.equal(cleanPath('src/\tParser\r\n.kt'), 'src/Parser.kt')
    assert.equal(cleanPath(`src${escape}a${bell}${del}b`), 'srcab')
  })

  it('the strict rule names every control character', () => {
    assert.equal(isAnyControl(escape), true)
    assert.equal(isAnyControl(String.fromCharCode(0)), true)
    assert.equal(isAnyControl(del), true)
    assert.equal(isAnyControl(introducer), true)
    assert.equal(isAnyControl(String.fromCharCode(0x80)), true)
    assert.equal(isAnyControl(String.fromCharCode(0x9f)), true)
    assert.equal(isAnyControl(String.fromCharCode(0xa0)), false)
    assert.equal(isAnyControl('\n'), true)
    assert.equal(isAnyControl('\r'), true)
    assert.equal(isAnyControl('\t'), true)
    assert.equal(isAnyControl('a'), false)
  })

  // --- The cut of a long text ---

  it('a cut keeps a character of two code units whole', () => {
    assert.equal(cutText(`ab${wide}`, 3), 'ab')
    assert.equal(cutText(`ab${wide}`, 4), `ab${wide}`)
    assert.equal(cutText(`ab${wide}`, 9), `ab${wide}`)
  })

  it('a cut of a plain text takes the first characters', () => {
    assert.equal(cutText('fix the parser', 3), 'fix')
    assert.equal(cutText('fix the parser', 0), '')
    assert.equal(cutText('fix the parser', 200), 'fix the parser')
  })
})
