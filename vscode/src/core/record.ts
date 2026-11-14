import { sha1Hex } from './digest'
import {
  flag,
  int,
  nullable,
  optional,
  plain,
  readObject,
  readWhole,
  required,
  text,
} from './kotlinJson'
import type { Lexer, Reader } from './kotlinJson'

export interface RecordRange {
  readonly startLine: number
  readonly startColumn?: number
  readonly endLine: number
  readonly endColumn?: number
}

export interface RecordLocation {
  readonly commit: string
  readonly path: string
  readonly range?: RecordRange
}

export interface ReviewRecord {
  readonly timestamp: string
  readonly author: string
  readonly description?: string
  readonly parent?: string
  readonly original?: string
  readonly resolved?: boolean
  readonly location?: RecordLocation
  readonly v?: number
}

// --- Canonical encoding ---

const ESCAPES: Readonly<Record<string, string>> = {
  '"': '\\"',
  '\\': '\\\\',
  '\b': '\\b',
  '\t': '\\t',
  '\n': '\\n',
  '\f': '\\f',
  '\r': '\\r',
}
// eslint-disable-next-line no-control-regex
const NEEDS_ESCAPE = /["\\\u0000-\u001f]/g

const quote = (value: string): string =>
  `"${value.replace(NEEDS_ESCAPE, (char) => ESCAPES[char] ?? `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`)}"`

type Field = readonly [string, string | undefined]

const object = (fields: readonly Field[]): string =>
  `{${fields
    .flatMap(([key, value]) => (value === undefined ? [] : [`${quote(key)}:${value}`]))
    .join(',')}}`

const optionalText = (value: string | undefined): string | undefined =>
  value === undefined ? undefined : quote(value)

const nonZero = (value: number | undefined): string | undefined =>
  value === undefined || value === 0 ? undefined : String(value)

const encodeRange = (range: RecordRange): string =>
  object([
    ['startLine', String(range.startLine)],
    ['startColumn', nonZero(range.startColumn)],
    ['endLine', String(range.endLine)],
    ['endColumn', nonZero(range.endColumn)],
  ])

const encodeLocation = (location: RecordLocation): string =>
  object([
    ['commit', quote(location.commit)],
    ['path', quote(location.path)],
    ['range', location.range && encodeRange(location.range)],
  ])

/** The line that kotlinx.serialization writes: field order of Comment.kt, no defaults. */
export const encodeRecord = (record: ReviewRecord): string =>
  object([
    ['timestamp', quote(record.timestamp)],
    ['author', quote(record.author)],
    ['description', optionalText(record.description)],
    ['parent', optionalText(record.parent)],
    ['original', optionalText(record.original)],
    ['resolved', record.resolved === undefined ? undefined : String(record.resolved)],
    ['location', record.location && encodeLocation(record.location)],
    ['v', nonZero(record.v)],
  ])

export const recordId = (record: ReviewRecord): string => sha1Hex(encodeRecord(record))

const readRange: Reader = (lexer) => {
  const values = readObject(
    lexer,
    new Map([
      ['startLine', int],
      ['startColumn', int],
      ['endLine', int],
      ['endColumn', int],
    ]),
  )
  return plain<RecordRange>(
    {
      startLine: required(values, 'startLine'),
      startColumn: optional(values, 'startColumn'),
      endLine: required(values, 'endLine'),
      endColumn: optional(values, 'endColumn'),
    },
    ['startColumn', 'endColumn'],
  )
}

const readLocation: Reader = (lexer) => {
  const values = readObject(
    lexer,
    new Map([
      ['commit', text],
      ['path', text],
      ['range', nullable(readRange)],
    ]),
  )
  return plain<RecordLocation>({
    commit: required(values, 'commit'),
    path: required(values, 'path'),
    range: optional(values, 'range'),
  })
}

const readRecord = (lexer: Lexer): ReviewRecord => {
  const values = readObject(
    lexer,
    new Map([
      ['timestamp', text],
      ['author', text],
      ['description', nullable(text)],
      ['parent', nullable(text)],
      ['original', nullable(text)],
      ['resolved', nullable(flag)],
      ['location', nullable(readLocation)],
      ['v', int],
    ]),
  )
  return plain<ReviewRecord>(
    {
      timestamp: required(values, 'timestamp'),
      author: required(values, 'author'),
      description: optional(values, 'description'),
      parent: optional(values, 'parent'),
      original: optional(values, 'original'),
      resolved: optional(values, 'resolved'),
      location: optional(values, 'location'),
      v: optional(values, 'v'),
    },
    ['v'],
  )
}

/** The record of one note line, or undefined for a line that the Kotlin decoder refuses. */
export const decodeRecord = (line: string): ReviewRecord | undefined => readWhole(line, readRecord)
