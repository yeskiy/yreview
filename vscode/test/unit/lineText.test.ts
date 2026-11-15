import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { MAX_LINES, MAX_UNITS, lineTextOf, lineTextOnDisk } from '../../src/core/lineText'
import type { RecordRange } from '../../src/core/record'

interface SnippetCase {
  name: string
  lines: string[]
  range: RecordRange
  text: string | null
}

const { snippet } = JSON.parse(
  readFileSync(path.resolve(__dirname, '../../../spec/vectors/carry.json'), 'utf8'),
) as { snippet: SnippetCase[] }

const of = (lines: readonly string[], range: RecordRange): string | undefined =>
  lineTextOf((line) => lines[line - 1] ?? '', lines.length, range)

describe('location.text of a new comment', () => {
  snippet.forEach((c) =>
    it(`snippet ${c.name}`, () => assert.equal(of(c.lines, c.range), c.text ?? undefined)),
  )

  it(`keeps ${MAX_LINES} lines and leaves out one more`, () => {
    const lines = Array.from({ length: MAX_LINES + 1 }, () => 'x')
    assert.equal(of(lines, { startLine: 1, endLine: MAX_LINES })?.split('\n').length, MAX_LINES)
    assert.equal(of(lines, { startLine: 1, endLine: MAX_LINES + 1 }), undefined)
  })

  it(`keeps ${MAX_UNITS} code units and leaves out one more`, () => {
    assert.equal(of(['x'.repeat(MAX_UNITS)], { startLine: 1, endLine: 1 })?.length, MAX_UNITS)
    assert.equal(of(['x'.repeat(MAX_UNITS + 1)], { startLine: 1, endLine: 1 }), undefined)
  })

  it('keeps a pair of surrogates', () => {
    assert.equal(of(['a😀'], { startLine: 1, endLine: 1 }), 'a😀')
  })

  it('reads the file on disk and gives no text for a missing file', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'yreview-text-'))
    try {
      writeFileSync(path.join(root, 'a.txt'), 'a\r\nb\nc\n')
      assert.equal(await lineTextOnDisk(root, 'a.txt', { startLine: 2, endLine: 3 }), 'b\nc')
      assert.equal(await lineTextOnDisk(root, 'a.txt', { startLine: 4, endLine: 4 }), undefined)
      assert.equal(await lineTextOnDisk(root, 'b.txt', { startLine: 1, endLine: 1 }), undefined)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
