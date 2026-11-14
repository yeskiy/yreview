export interface ReviewComment {
  readonly id: string
  readonly path: string
  readonly startLine: number
  readonly startColumn?: number
  readonly endLine: number
  readonly endColumn?: number
  readonly revision: string
  readonly side?: 'left' | 'right'
  readonly text: string
}

export interface ReviewBatch {
  readonly batchId: string
  readonly branch: string
  readonly commit: string
  readonly comments: readonly ReviewComment[]
}

export type BatchParse =
  | { readonly kind: 'ok'; readonly batch: ReviewBatch }
  | { readonly kind: 'bad'; readonly reason: string }

export const MAX_COMMENTS = 200
export const MAX_TEXT = 20_000
export const MAX_PATH = 1024
export const MAX_BRANCH = 255
export const MAX_LINE = 10_000_000
export const MAX_NAME = 200
const INT_LIMIT = 2_147_483_647
// The same rules stand in src/bridge/batchBuilder.ts and in BatchBuilder.kt. Keep the copies equal.
const OPAQUE_ID = /^[A-Za-z0-9_-]+$/
const REVISION = /^[A-Za-z0-9._/-]+$/

type Kind = 'string' | 'int' | 'side' | 'array'
const BATCH_FIELDS: Readonly<Record<string, Kind>> = {
  batchId: 'string',
  branch: 'string',
  commit: 'string',
  comments: 'array',
}
const COMMENT_FIELDS: Readonly<Record<string, Kind>> = {
  id: 'string',
  path: 'string',
  startLine: 'int',
  startColumn: 'int',
  endLine: 'int',
  endColumn: 'int',
  revision: 'string',
  side: 'side',
  text: 'string',
}
const OPTIONAL = new Set(['startColumn', 'endColumn', 'side'])

/** A plain line must not hold one of these, because a line break splits one comment. */
export const isControl = (code: number): boolean => code < 0x20 || code === 0x7f

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const fits = (kind: Kind, value: unknown): boolean => {
  if (kind === 'string') return typeof value === 'string'
  if (kind === 'int')
    return typeof value === 'number' && Number.isInteger(value) && Math.abs(value) <= INT_LIMIT
  if (kind === 'side') return value === 'left' || value === 'right'
  return Array.isArray(value)
}

const shapeProblem = (
  value: unknown,
  fields: Readonly<Record<string, Kind>>,
  place: string,
): string | undefined => {
  if (!isObject(value)) return `${place} is not a JSON object`
  const unknown = Object.keys(value).find((key) => !Object.hasOwn(fields, key))
  if (unknown !== undefined)
    return `${place} holds the field ${unknown}, which the contract does not name`
  return Object.entries(fields)
    .map(([name, kind]) => {
      const field = value[name]
      if (field === undefined || field === null)
        return OPTIONAL.has(name) ? undefined : `the field ${name} of ${place} is missing`
      return fits(kind, field) ? undefined : `the field ${name} of ${place} has the wrong type`
    })
    .find((problem) => problem !== undefined)
}

const count = (field: string, value: number, low: number, high: number): string | undefined =>
  value >= low && value <= high
    ? undefined
    : `${field} must hold between ${low} and ${high} entries, and it holds ${value}`

const opaqueId = (field: string, value: string): string | undefined =>
  count(field, value.length, 1, MAX_NAME) ??
  (OPAQUE_ID.test(value)
    ? undefined
    : `${field} may hold letters, digits, underscores, and hyphens only`)

const revision = (field: string, value: string): string | undefined =>
  count(field, value.length, 1, MAX_NAME) ??
  (REVISION.test(value)
    ? undefined
    : `${field} may hold letters, digits, dots, underscores, slashes, and hyphens only`)

const plainLine = (field: string, value: string, max: number): string | undefined =>
  count(field, value.length, 1, max) ??
  (Array.from(value).some((char) => isControl(char.charCodeAt(0)))
    ? `${field} must not hold a control character`
    : undefined)

const line = (field: string, value: number): string | undefined =>
  value >= 0 && value <= MAX_LINE
    ? undefined
    : `${field} must hold a whole number between 0 and ${MAX_LINE}`

const checkComment = (comment: ReviewComment): string | undefined =>
  opaqueId('id', comment.id) ??
  plainLine('path', comment.path, MAX_PATH) ??
  line('startLine', comment.startLine) ??
  (comment.startColumn === undefined ? undefined : line('startColumn', comment.startColumn)) ??
  line('endLine', comment.endLine) ??
  (comment.endColumn === undefined ? undefined : line('endColumn', comment.endColumn)) ??
  revision('revision', comment.revision) ??
  count('text', comment.text.length, 1, MAX_TEXT)

export const checkBatch = (batch: ReviewBatch): string | undefined =>
  opaqueId('batchId', batch.batchId) ??
  plainLine('branch', batch.branch, MAX_BRANCH) ??
  revision('commit', batch.commit) ??
  count('comments', batch.comments.length, 1, MAX_COMMENTS) ??
  batch.comments.map(checkComment).find((problem) => problem !== undefined)

const present = (value: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(value).filter(([, field]) => field !== null && field !== undefined),
  )

/** Checks a value that JSON.parse already read. */
export const checkShape = (value: unknown): BatchParse => {
  const problem =
    shapeProblem(value, BATCH_FIELDS, 'the batch') ??
    (value as { comments: unknown[] }).comments
      .map((comment, at) => shapeProblem(comment, COMMENT_FIELDS, `comment ${at}`))
      .find((found) => found !== undefined)
  if (problem !== undefined) return { kind: 'bad', reason: problem }
  const raw = value as {
    batchId: string
    branch: string
    commit: string
    comments: Record<string, unknown>[]
  }
  const batch: ReviewBatch = {
    ...raw,
    comments: raw.comments.map((comment) => present(comment) as unknown as ReviewComment),
  }
  const broken = checkBatch(batch)
  return broken === undefined ? { kind: 'ok', batch } : { kind: 'bad', reason: broken }
}

export const parseBatch = (text: string): BatchParse => {
  try {
    return checkShape(JSON.parse(text))
  } catch (failure) {
    return {
      kind: 'bad',
      reason: failure instanceof Error ? failure.message : 'the value does not match the contract',
    }
  }
}
