import assert from 'node:assert/strict'

import { sha1Hex } from '../../src/core/digest'
import { type ReviewRecord, decodeRecord, encodeRecord, recordId } from '../../src/core/record'

describe('record', () => {
  const sample: ReviewRecord = {
    timestamp: '1787194427',
    author: 'reviewer@example.com',
    description: 'This branch never runs when the input is empty.',
    location: {
      commit: '4f2c8b1',
      path: 'src/main/kotlin/Parser.kt',
      range: { startLine: 88, endLine: 94 },
    },
  }

  it('encodes to a single line', () => {
    assert.equal(encodeRecord(sample).split(/\r\n|\r|\n/).length, 1)
  })

  it('round trips without loss', () => {
    assert.deepEqual(decodeRecord(encodeRecord(sample)), sample)
  })

  it('keeps the timestamp as a ten digit string', () => {
    const line = encodeRecord(sample)
    assert.ok(line.includes('"timestamp":"1787194427"'), line)
  })

  it('accepts a line written by another tool', () => {
    const decoded = decodeRecord(
      '{"timestamp":"1700000000","author":"a@b.c","description":"hi","v":0}',
    )
    assert.equal(decoded?.author, 'a@b.c')
    assert.equal(decoded?.location, undefined)
  })

  it('ignores fields it does not know', () => {
    assert.equal(
      decodeRecord('{"timestamp":"1700000000","author":"a@b.c","futureField":true}')?.author,
      'a@b.c',
    )
  })

  it('the id is stable and differs between comments', () => {
    const other = { ...sample, description: 'something else' }
    assert.equal(recordId(sample), recordId({ ...sample }))
    assert.notEqual(recordId(sample), recordId(other))
    assert.equal(recordId(sample).length, 40)
  })

  it('takes the Kotlin identifier of a record with a lone surrogate', () => {
    const record = { timestamp: '1', author: 'a@b.c', description: 'x\ud800y' }
    assert.equal(
      recordId(record),
      sha1Hex('{"timestamp":"1","author":"a@b.c","description":"x?y"}'),
    )
  })

  it('writes U+2028 and U+007F as themselves and escapes U+001F in lowercase', () => {
    assert.equal(
      encodeRecord({ timestamp: '1', author: 'a', description: '\u2028\u007f\u001f' }),
      '{"timestamp":"1","author":"a","description":"\u2028\u007f\\u001f"}',
    )
  })

  it('reads the literals that the Kotlin decoder reads', () => {
    const line = (value: string): string | undefined => {
      const record = decodeRecord(`{"timestamp":"1","author":"a",${value}}`)
      return record && encodeRecord(record)
    }
    assert.equal(line('"v":03'), '{"timestamp":"1","author":"a","v":3}')
    assert.equal(line('"v":30e-1'), '{"timestamp":"1","author":"a","v":3}')
    assert.equal(line('"v":-e1'), '{"timestamp":"1","author":"a"}')
    assert.equal(line('"v":15e-1'), undefined)
    assert.equal(line('"v":"1 "'), undefined)
    assert.equal(line('"resolved":tRuE'), '{"timestamp":"1","author":"a","resolved":true}')
    assert.equal(line('"resolved":"t"'), undefined)
    assert.equal(line('"description":nullx'), undefined)
    assert.equal(line('"extra":[1 2,{a:}]'), '{"timestamp":"1","author":"a"}')
    assert.equal(line('"extra":[1}'), undefined)
    assert.equal(line('"extra":"x\\qy"'), undefined)
  })

  it('reads two members without a comma and refuses a comma before the end', () => {
    assert.equal(decodeRecord('{"timestamp":"1" "author":"a"}')?.author, 'a')
    assert.equal(decodeRecord('{"timestamp":"1","author":"a",}'), undefined)
    assert.equal(decodeRecord('{,"timestamp":"1","author":"a"}'), undefined)
  })

  it('reads each value of a repeated key and keeps the last one', () => {
    assert.equal(decodeRecord('{"timestamp":"1","author":"a","v":1,"v":"x"}'), undefined)
    assert.equal(
      decodeRecord('{"timestamp":"1","author":"a","description":"x","description":null}')
        ?.description,
      undefined,
    )
  })

  it('reads a key named like an object property as unknown', () => {
    assert.equal(
      decodeRecord('{"timestamp":"1","author":"a","__proto__":{"v":5},"toString":1}')?.v,
      undefined,
    )
  })
})
