import type { RecordRange } from './record'

/** Whole lines for a caret or a selection of whole lines, as CommentRange.of does. */
export const commentRange = (
  startLine: number,
  startColumn: number,
  endLine: number,
  endColumn: number,
  endLineLength: number,
): RecordRange =>
  (startLine === endLine && startColumn === endColumn) ||
  (startColumn === 0 && (endColumn === 0 || endColumn === endLineLength))
    ? { startLine, endLine }
    : { startLine, startColumn, endLine, endColumn }

export const hasColumns = (startColumn?: number, endColumn?: number): boolean =>
  (startColumn ?? 0) !== 0 || (endColumn ?? 0) !== 0

/** The first character of a range, or undefined for a range of whole lines. */
export const startColumnOf = (range: RecordRange): number | undefined =>
  hasColumns(range.startColumn, range.endColumn) ? (range.startColumn ?? 0) : undefined

/** The end character of a range, or undefined for a range of whole lines. */
export const endColumnOf = (range: RecordRange): number | undefined =>
  hasColumns(range.startColumn, range.endColumn) ? (range.endColumn ?? 0) : undefined

export const compactRange = (range: RecordRange): string =>
  hasColumns(range.startColumn, range.endColumn)
    ? `${range.startLine}:${range.startColumn ?? 0}-${range.endLine}:${range.endColumn ?? 0}`
    : `${range.startLine}-${range.endLine}`

export const rangeWords = (range: RecordRange): string => {
  const start = range.startColumn ?? 0
  const end = range.endColumn ?? 0
  const lines = `lines ${range.startLine}-${range.endLine}`
  if (!hasColumns(start, end)) return lines
  return range.startLine === range.endLine
    ? `${lines}, from character ${start} to character ${end}`
    : `${lines}, from character ${start} of line ${range.startLine} to character ${end} of line ${range.endLine}`
}
