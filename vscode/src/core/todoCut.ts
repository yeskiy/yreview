import { isKotlinBlank } from './kotlinText'

/** A part of a text, from start up to end. The character at end stays. */
export interface TextCut {
  readonly start: number
  readonly end: number
}

const isSpace = (unit: string | undefined): boolean =>
  unit !== undefined && unit !== '' && isKotlinBlank(unit)

// Kotlin Char.isLetterOrDigit tests one UTF-16 unit, so a surrogate half is neither.
const hasLetterOrDigit = (text: string): boolean =>
  text.split('').some((unit) => /[\p{L}\p{Nd}]/u.test(unit))

const lineStart = (text: string, offset: number): number =>
  offset <= 0 ? 0 : text.lastIndexOf('\n', offset - 1) + 1

const lineEnd = (text: string, offset: number): number => {
  const index = text.indexOf('\n', offset)
  return index < 0 ? text.length : index
}

/** The offset after the line break at `at`. A CRLF break goes whole. */
const lineBreak = (text: string, at: number): number => {
  if (text.startsWith('\r\n', at)) return at + 2
  return text[at] === '\n' ? at + 1 : at
}

const spaceStart = (text: string, first: number, start: number): number =>
  Array.from({ length: start - first + 1 }, (_, index) => start - index).find(
    (at) => at === first || !isSpace(text[at - 1]),
  ) ?? first

const spaceEnd = (text: string, end: number, last: number): number =>
  Array.from({ length: last - end + 1 }, (_, index) => end + index).find(
    (at) => at === last || !isSpace(text[at]),
  ) ?? last

/** The cut of a whole comment. A comment alone on its line takes the line and its break. */
export const cutOf = (text: string, start: number, end: number): TextCut => {
  const first = lineStart(text, start)
  const last = lineEnd(text, end)
  const before = text.slice(first, start)
  if (isKotlinBlank(before) && isKotlinBlank(text.slice(end, last))) {
    return { start: first, end: lineBreak(text, last) }
  }
  if (isKotlinBlank(before)) return { start, end: spaceEnd(text, end, last) }
  return { start: spaceStart(text, first, start), end }
}

const clamp = (value: number, low: number, high: number): number =>
  Math.min(Math.max(value, low), high)

/** The cut of one row, or undefined when a cut of the row would break the comment. */
export const rowCut = (
  text: string,
  commentStart: number,
  commentEnd: number,
  rowStart: number,
  rowEnd: number,
): TextCut | undefined => {
  const first = lineStart(text, commentStart)
  const last = lineEnd(text, commentEnd)
  const start = Math.max(rowStart, first)
  const end = Math.min(rowEnd, last)
  if (start > end) return undefined
  const rest =
    text.slice(commentStart, clamp(start, commentStart, commentEnd)) +
    text.slice(clamp(end, commentStart, commentEnd), commentEnd)
  if (!hasLetterOrDigit(rest)) return cutOf(text, commentStart, commentEnd)
  if (start === first || end === last) return undefined
  return { start, end: lineBreak(text, end) }
}

/** The cuts of one file from the last to the first. Cuts that lie over each other become one. */
export const apartCuts = (cuts: readonly TextCut[]): readonly TextCut[] =>
  [...cuts]
    .sort((a, b) => b.start - a.start)
    .reduce<readonly TextCut[]>((kept, cut) => {
      const last = kept[kept.length - 1]
      return last === undefined || cut.end <= last.start
        ? [...kept, cut]
        : [...kept.slice(0, -1), { start: cut.start, end: Math.max(last.end, cut.end) }]
    }, [])
