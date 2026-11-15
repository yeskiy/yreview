/** Zero-based source lines, both ends inclusive. */
export interface LineRange {
  readonly start: number
  readonly end: number
}

/** One block of a preview: its source lines and the line where its text starts, all 0-based. */
export interface TextBlock<N> {
  readonly node: N
  readonly start: number
  readonly end: number
  readonly text: number
}

export const MAX_LINE = 10_000_000
export const START_KEY = 'yreviewStart'
export const END_KEY = 'yreviewEnd'
const DIGITS = /^(0|[1-9][0-9]{0,7})$/

/** The line of a data-line attribute, or undefined for a value that is not a line. */
export const lineOf = (value: string | null | undefined): number | undefined =>
  value != null && DIGITS.test(value) && Number(value) <= MAX_LINE ? Number(value) : undefined

/** The line of a point in a block, from the block text before the point. It stays inside the block. */
export const lineInBlock = (
  block: { readonly start: number; readonly end: number; readonly text: number },
  before: string,
): number => Math.min(Math.max(block.text + before.split('\n').length - 1, block.start), block.end)

/** The blocks that hold no other block of the list. */
export const leavesOf = <N>(
  blocks: readonly TextBlock<N>[],
  contains: (outer: N, inner: N) => boolean,
): TextBlock<N>[] =>
  blocks.filter(
    (block) => !blocks.some((other) => other !== block && contains(block.node, other.node)),
  )

/** The lines from the start point in the first hit block to the end point in the last one. */
export const selectionSpan = <N>(
  blocks: readonly TextBlock<N>[],
  hit: (node: N) => boolean,
  contains: (outer: N, inner: N) => boolean,
  before: (node: N, edge: 'start' | 'end') => string | undefined,
): LineRange | undefined => {
  const leaves = leavesOf(
    blocks.filter((block) => hit(block.node)),
    contains,
  )
  const [first] = leaves
  const last = leaves[leaves.length - 1]
  if (first === undefined || last === undefined) return undefined
  const startText = before(first.node, 'start')
  const endText = before(last.node, 'end')
  const start = startText === undefined ? first.start : lineInBlock(first, startText)
  return {
    start,
    end: Math.max(start, endText === undefined ? last.end : lineInBlock(last, endText)),
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
