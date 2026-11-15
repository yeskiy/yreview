/** Zero-based source lines, both ends inclusive. */
export interface LineRange {
  readonly start: number
  readonly end: number
}

/** One element of the preview and the source line of its data-line attribute. */
export interface Block<N> {
  readonly node: N
  readonly line: number
}

export const MAX_LINE = 10_000_000
export const START_KEY = 'yreviewStart'
export const END_KEY = 'yreviewEnd'
const DIGITS = /^(0|[1-9][0-9]{0,7})$/

/** The line of a data-line attribute, or undefined for a value that is not a line. */
export const lineOf = (value: string | null | undefined): number | undefined =>
  value != null && DIGITS.test(value) && Number(value) <= MAX_LINE ? Number(value) : undefined

/** The lines of the innermost hit blocks. A block ends on the line before the next block. */
export const spanOf = <N>(
  blocks: readonly Block<N>[],
  hit: (node: N) => boolean,
  contains: (outer: N, inner: N) => boolean,
): LineRange | undefined => {
  const hits = blocks.filter((block) => hit(block.node))
  const leaves = hits
    .filter((block) => !hits.some((other) => other !== block && contains(block.node, other.node)))
    .map((block) => block.line)
  if (leaves.length === 0) return undefined
  const last = leaves.reduce((top, line) => Math.max(top, line))
  const next = blocks
    .map((block) => block.line)
    .filter((line) => line > last)
    .reduce((low, line) => Math.min(low, line), Infinity)
  return {
    start: leaves.reduce((low, line) => Math.min(low, line)),
    end: Number.isFinite(next) ? next - 1 : last,
  }
}

const isLine = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= MAX_LINE

/** The lines that a preview context menu sends, or undefined. The values come from the document. */
export const rangeOfContext = (context: unknown): LineRange | undefined => {
  const { [START_KEY]: start, [END_KEY]: end } =
    typeof context === 'object' && context !== null ? (context as Record<string, unknown>) : {}
  return isLine(start) && isLine(end) && start <= end ? { start, end } : undefined
}

/** The range inside a document of `count` lines, without the blank lines at its end. */
export const fitted = (
  range: LineRange,
  count: number,
  blank: (line: number) => boolean,
): LineRange | undefined => {
  if (range.start >= count) return undefined
  const end = Math.min(range.end, count - 1)
  return {
    start: range.start,
    end:
      Array.from({ length: end - range.start }, (_, back) => end - back).find(
        (line) => !blank(line),
      ) ?? range.start,
  }
}
