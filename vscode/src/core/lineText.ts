import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { splitLines } from './lineMap'
import type { RecordRange } from './record'

export const MAX_LINES = 100
export const MAX_UNITS = 4000

// With the u flag, a pair of surrogates reads as one code point, so only a lone surrogate matches.
const LONE_SURROGATE = /[\uD800-\uDFFF]/u

/** The value of `location.text` (spec section 17.4), or undefined when the writer leaves it out. */
export const lineTextOf = (
  lineAt: (line: number) => string,
  lineCount: number,
  range: RecordRange,
): string | undefined => {
  const first = Math.min(range.startLine, range.endLine)
  const last = Math.max(range.startLine, range.endLine)
  if (last - first + 1 > MAX_LINES || first < 1 || first > lineCount) return undefined
  const text = Array.from({ length: Math.min(last, lineCount) - first + 1 }, (_, index) =>
    lineAt(first + index).replace(/\r$/u, ''),
  ).join('\n')
  return text.length > MAX_UNITS || LONE_SURROGATE.test(text) ? undefined : text
}

/** The text of the file on disk, for a write of an agent. A file that is not there gives no text. */
export const lineTextOnDisk = async (
  root: string,
  file: string,
  range: RecordRange,
): Promise<string | undefined> => {
  const lines = splitLines(await readFile(path.join(root, file), 'utf8').catch(() => ''))
  return lineTextOf((line) => lines[line - 1] ?? '', lines.length, range)
}
