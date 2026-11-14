import { endColumnOf, startColumnOf } from '../core/range'
import type { StoredComment } from '../store/commentBook'
import { ANALYSES, DISCUSS, LOCAL, isShared } from '../store/noteRefs'
import type { StoreKind } from '../store/reviewService'

export { normalizeRelative as normalizePath } from '../core/paths'

export type Payload = Readonly<Record<string, unknown>>

export interface CommentRow {
  readonly id: string
  readonly path: string
  readonly startLine: number
  readonly startColumn?: number
  readonly endLine: number
  readonly endColumn?: number
  readonly revision: string
  readonly author: string
  readonly text: string
  readonly shared: boolean
  readonly resolved: boolean
}

const REVISION = /^[0-9a-fA-F]{7,64}$/

/** A note travels with the repository, so its revision is checked before a git command reads it. */
export const isCommitRevision = (text: string): boolean => REVISION.test(text)

export const refsFor = (includeAnalyses: boolean, includeLocal: boolean): readonly string[] => [
  DISCUSS,
  ...(includeAnalyses ? [ANALYSES] : []),
  ...(includeLocal ? [LOCAL] : []),
]

/** A folder store has no remote, and a failed push is not shared. */
export const isSharedRow = (kind: StoreKind, ref: string, shareError?: string): boolean =>
  kind === 'git' && isShared(ref) && shareError === undefined

/** A record reads a line as a signed 32-bit number, so a larger end line makes a record that nobody reads. */
const LINE_LIMIT = 2_147_483_647

export const rangeProblem = (startLine: number, endLine: number): string | undefined => {
  if (startLine < 1) return 'startLine must be 1 or more.'
  if (endLine < startLine) return 'endLine must be equal to startLine or larger.'
  if (endLine > LINE_LIMIT) return `endLine must be ${LINE_LIMIT} or less.`
  return undefined
}

export const rowOf = (
  stored: StoredComment,
  resolved: boolean,
  kind: StoreKind,
  handle: string,
): CommentRow | undefined => {
  const { location } = stored.record
  if (location === undefined) return undefined
  const { range } = location
  return {
    id: handle,
    path: location.path,
    startLine: range?.startLine ?? 0,
    startColumn: range === undefined ? undefined : startColumnOf(range),
    endLine: range?.endLine ?? 0,
    endColumn: range === undefined ? undefined : endColumnOf(range),
    revision: location.commit,
    author: stored.record.author,
    text: stored.record.description ?? '',
    shared: isSharedRow(kind, stored.ref),
    resolved,
  }
}

export const listPayload = (rows: readonly CommentRow[]): Payload => ({ comments: rows })

export const addedPayload = (
  id: string,
  path: string,
  revision: string,
  shared: boolean,
): Payload => ({ id, path, revision, shared })

export const resolvedPayload = (id: string): Payload => ({ id, resolved: true })

export const openedPayload = (
  id: string,
  opened: 'file' | 'diff',
  path: string,
  line: number,
  revision: string,
): Payload => ({ id, opened, path, line, revision })

export const errorPayload = (message: string): Payload => ({ error: message })
