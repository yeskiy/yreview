export interface Point {
  readonly line: number
  readonly character: number
}

export interface Span {
  readonly start: Point
  readonly end: Point
}

/** A part of the text that the same number of spans cover. The depth is that number, capped. */
export interface Segment extends Span {
  readonly count: number
  readonly depth: number
}

export const MAX_DEPTH = 3

const compare = (a: Point, b: Point): number => a.line - b.line || a.character - b.character

/** Splits the spans at each start and end, and counts the spans that cover each part. */
export const segments = (spans: readonly Span[]): Segment[] => {
  const full = spans.filter((span) => compare(span.start, span.end) < 0)
  const points = full
    .flatMap((span) => [span.start, span.end])
    .sort(compare)
    .filter((point, index, all) => index === 0 || compare(all[index - 1] as Point, point) !== 0)
  return points
    .slice(1)
    .map((end, index) => {
      const start = points[index] as Point
      const count = full.filter(
        (span) => compare(span.start, start) <= 0 && compare(end, span.end) <= 0,
      ).length
      return { start, end, count, depth: Math.min(count, MAX_DEPTH) }
    })
    .filter((segment) => segment.count > 0)
    .reduce<Segment[]>((joined, segment) => {
      const last = joined.at(-1)
      return last !== undefined &&
        last.count === segment.count &&
        compare(last.end, segment.start) === 0
        ? [...joined.slice(0, -1), { ...last, end: segment.end }]
        : [...joined, segment]
    }, [])
}
