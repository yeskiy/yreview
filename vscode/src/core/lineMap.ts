import type { RecordRange } from './record'

/** One hunk of `git diff -U0`. `removed` holds the old lines that the hunk replaced. */
export interface Hunk {
  readonly oldStart: number
  readonly oldCount: number
  readonly newStart: number
  readonly newCount: number
  readonly removed: readonly string[]
}

/** The changes of one path from a comment commit to the working tree. */
export interface FileDiff {
  readonly path: string
  readonly deleted: boolean
  readonly binary: boolean
  readonly hunks: readonly Hunk[]
}

/** Where one open comment stands in the working tree. spec/format.md section 17 states the rule. */
export type Carry =
  | { readonly kind: 'same'; readonly range?: RecordRange }
  | { readonly kind: 'outdated'; readonly range: RecordRange; readonly original: readonly string[] }
  | { readonly kind: 'gone' }
  | { readonly kind: 'missing' }

const HUNK = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/u
const DIFF = 'diff --git '
const OCTAL = /^[0-7]{3}/u
const ESCAPES: Readonly<Record<string, number>> = {
  '\\': 0x5c,
  '"': 0x22,
  t: 0x09,
  n: 0x0a,
  r: 0x0d,
  a: 0x07,
  b: 0x08,
  f: 0x0c,
  v: 0x0b,
}

/** The range that the editor draws, and undefined for a comment that it does not draw. */
export const shownRange = (carry: Carry): RecordRange | undefined =>
  carry.kind === 'same' || carry.kind === 'outdated' ? carry.range : undefined

export const splitLines = (text: string): readonly string[] =>
  text === ''
    ? []
    : text
        .replace(/\n$/u, '')
        .split('\n')
        .map((line) => line.replace(/\r$/u, ''))

const unquoteFrom = (text: string, index: number, bytes: readonly number[]): string | undefined => {
  const point = text.codePointAt(index)
  if (point === undefined) return undefined
  const char = String.fromCodePoint(point)
  if (char === '"') return Buffer.from(bytes).toString('utf8')
  if (char !== '\\')
    return unquoteFrom(text, index + char.length, [...bytes, ...Buffer.from(char, 'utf8')])
  const octal = OCTAL.exec(text.slice(index + 1, index + 4))
  if (octal !== null) return unquoteFrom(text, index + 4, [...bytes, Number.parseInt(octal[0], 8)])
  const escaped = ESCAPES[text[index + 1] ?? '']
  return escaped === undefined ? undefined : unquoteFrom(text, index + 2, [...bytes, escaped])
}

/** A C string of git with its quotes, or a plain name that loses one tab at its end. */
export const unquote = (text: string): string | undefined =>
  text.startsWith('"') ? unquoteFrom(text, 1, []) : text.replace(/\t$/u, '')

const named = (headers: readonly string[], prefix: string, side: string): string | undefined => {
  const line = headers.find(
    (header) => header.startsWith(prefix) && header !== `${prefix}/dev/null`,
  )
  const name = line === undefined ? undefined : unquote(line.slice(prefix.length))
  return name?.startsWith(side) === true ? name.slice(side.length) : undefined
}

const pathOfDiffLine = (line: string): string | undefined => {
  const rest = line.slice(DIFF.length)
  if (rest.startsWith('"')) {
    const name = unquote(rest)
    return name?.startsWith('a/') === true ? name.slice(2) : undefined
  }
  const name = rest.slice(2, 2 + (rest.length - 5) / 2)
  return rest.length > 5 && (rest.length - 5) % 2 === 0 && rest === `a/${name} b/${name}`
    ? name
    : undefined
}

const hunkOf = (lines: readonly string[]): Hunk => {
  const head = HUNK.exec(lines[0] ?? '')
  const value = (index: number): number => Number(head?.[index] ?? '1')
  return {
    oldStart: value(1),
    oldCount: value(2),
    newStart: value(3),
    newCount: value(4),
    removed: lines
      .slice(1)
      .filter((line) => line.startsWith('-'))
      .map((line) => line.slice(1)),
  }
}

const startsOf = (lines: readonly string[], test: (line: string) => boolean): readonly number[] =>
  lines.flatMap((line, index) => (test(line) ? [index] : []))

const piecesOf = (
  lines: readonly string[],
  starts: readonly number[],
): readonly (readonly string[])[] =>
  starts.map((start, index) => lines.slice(start, starts[index + 1] ?? lines.length))

const fileOf = (block: readonly string[]): FileDiff | undefined => {
  const found = block.findIndex((line) => HUNK.test(line))
  const headers = found < 0 ? block : block.slice(0, found)
  const path =
    named(headers, '--- ', 'a/') ?? named(headers, '+++ ', 'b/') ?? pathOfDiffLine(block[0] ?? '')
  if (path === undefined) return undefined
  const body = found < 0 ? [] : block.slice(found)
  return {
    path,
    deleted: headers.some(
      (line) => line === '+++ /dev/null' || line.startsWith('deleted file mode'),
    ),
    binary: headers.some((line) => line.startsWith('Binary files ')),
    hunks: piecesOf(
      body,
      startsOf(body, (line) => HUNK.test(line)),
    ).map(hunkOf),
  }
}

export const parseDiff = (text: string): ReadonlyMap<string, FileDiff> => {
  const lines = splitLines(text)
  return new Map(
    piecesOf(
      lines,
      startsOf(lines, (line) => line.startsWith(DIFF)),
    ).flatMap((block) => {
      const file = fileOf(block)
      return file === undefined ? [] : [[file.path, file] as const]
    }),
  )
}

const before = (hunk: Hunk, line: number): boolean =>
  hunk.oldCount > 0 ? hunk.oldStart + hunk.oldCount - 1 < line : hunk.oldStart < line

const touches = (hunk: Hunk, first: number, last: number): boolean =>
  hunk.oldCount > 0
    ? hunk.oldStart <= last && hunk.oldStart + hunk.oldCount - 1 >= first
    : hunk.oldStart >= first && hunk.oldStart < last

const shift = (hunks: readonly Hunk[], line: number): number =>
  hunks
    .filter((hunk) => before(hunk, line))
    .reduce((at, hunk) => at + hunk.newCount - hunk.oldCount, line)

const holder = (hunks: readonly Hunk[], line: number): Hunk | undefined =>
  hunks.find(
    (hunk) => hunk.oldCount > 0 && line >= hunk.oldStart && line < hunk.oldStart + hunk.oldCount,
  )

const matchesAt = (current: readonly string[], wanted: readonly string[]): readonly number[] =>
  Array.from(
    { length: Math.max(current.length - wanted.length + 1, 0) },
    (_, index) => index + 1,
  ).filter((at) => wanted.every((line, index) => current[at - 1 + index] === line))

/** Section 17.2: the diff rule alone. */
const mapped = (
  diff: FileDiff | undefined,
  range: RecordRange | undefined,
  current: readonly string[],
): Carry => {
  if (diff === undefined) return { kind: 'same', range }
  if (diff.deleted || current.length === 0) return { kind: 'gone' }
  if (range === undefined) return { kind: 'same' }
  const first = Math.min(range.startLine, range.endLine)
  const last = Math.max(range.startLine, range.endLine)
  const clamp = (line: number): number => Math.min(Math.max(line, 1), current.length)
  if (diff.binary) {
    return {
      kind: 'outdated',
      range: { startLine: clamp(first), endLine: clamp(first) },
      original: [],
    }
  }
  const { hunks } = diff
  const touching = hunks.filter((hunk) => touches(hunk, first, last))
  const top = touching[0]
  const bottom = touching.at(-1)
  if (top === undefined || bottom === undefined) {
    return {
      kind: 'same',
      range: {
        ...range,
        startLine: shift(hunks, range.startLine),
        endLine: shift(hunks, range.endLine),
      },
    }
  }
  const from =
    top.oldCount > 0 && top.oldStart <= first
      ? top.newStart + (top.newCount > 0 ? 0 : 1)
      : shift(hunks, first)
  const to =
    bottom.oldCount > 0 && bottom.oldStart + bottom.oldCount - 1 >= last
      ? bottom.newStart + Math.max(bottom.newCount - 1, 0)
      : shift(hunks, last)
  return {
    kind: 'outdated',
    range: { startLine: clamp(from), endLine: clamp(Math.max(to, from)) },
    original: Array.from({ length: last - first + 1 }, (_, index) => {
      const line = first + index
      const hunk = holder(hunks, line)
      return (
        (hunk === undefined ? undefined : hunk.removed[line - hunk.oldStart]) ??
        current[shift(hunks, line) - 1] ??
        ''
      )
    }),
  }
}

/** Section 17.3 on top of section 17.2. `head` is a comment of HEAD or of a folder store. */
export const carryOf = (
  diff: FileDiff | undefined,
  range: RecordRange | undefined,
  current: readonly string[],
  text?: string,
  head = false,
  refused = false,
): Carry => {
  const base = ((): Carry => {
    if (refused) return { kind: 'missing' }
    return head ? { kind: 'same', range } : mapped(diff, range, current)
  })()
  if (text === undefined || range === undefined || base.kind === 'gone' || diff?.binary === true) {
    return base
  }
  const wanted = text.split('\n')
  const first = Math.min(range.startLine, range.endLine)
  const shown = shownRange(base)
  const near = shown === undefined ? first : Math.min(shown.startLine, shown.endLine)
  const match = matchesAt(current, wanted).reduce<number | undefined>(
    (best, at) => (best === undefined || Math.abs(at - near) < Math.abs(best - near) ? at : best),
    undefined,
  )
  if (match !== undefined) {
    return {
      kind: 'same',
      range: {
        ...range,
        startLine: range.startLine + match - first,
        endLine: range.endLine + match - first,
      },
    }
  }
  if (head || refused) return base
  const place = shown ?? range
  const top = Math.min(Math.max(Math.min(place.startLine, place.endLine), 1), current.length)
  const bottom = Math.min(Math.max(Math.max(place.startLine, place.endLine), top), current.length)
  return { kind: 'outdated', range: { startLine: top, endLine: bottom }, original: wanted }
}
