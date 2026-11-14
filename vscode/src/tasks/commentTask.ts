import { kotlinTrim } from '../core/kotlinText'
import { isRelativeUnder } from '../core/paths'
import { endColumnOf, startColumnOf } from '../core/range'
import type { StoredComment } from '../store/commentBook'
import { isShared } from '../store/noteRefs'
import { WORKTREE } from '../core/anchor'
import type { ReviewTask } from './reviewTask'

/** One record that a scan read, and whether somebody resolved it. */
export interface ScanRecord {
  readonly stored: StoredComment
  readonly resolved: boolean
}

export const pickRecords = (
  open: readonly StoredComment[],
  closed: readonly StoredComment[],
  showResolved: boolean,
): readonly ScanRecord[] => [
  ...open.map((stored) => ({ stored, resolved: false })),
  ...(showResolved ? closed.map((stored) => ({ stored, resolved: true })) : []),
]

export const COMMENT_WORDS = {
  resolved: 'resolved',
  local: 'local',
  notShared: 'not shared',
  shared: 'shared',
} as const

/** The word after the title of a comment row. A resolved record shows that word alone. */
export const commentWord = (
  shared: boolean,
  worktree: boolean,
  unshared: boolean,
  resolved: boolean,
): string => {
  if (resolved) return COMMENT_WORDS.resolved
  if (!shared) return COMMENT_WORDS.local
  return worktree || unshared ? COMMENT_WORDS.notShared : COMMENT_WORDS.shared
}

/** Undefined for a record with no place, no text, or a path that leaves the root. */
export const commentTask = (
  record: ScanRecord,
  rootPath: string,
  unshared: boolean,
): ReviewTask | undefined => {
  const { stored } = record
  const { location } = stored.record
  const text = kotlinTrim(stored.record.description ?? '')
  if (location === undefined || text === '' || !isRelativeUnder(rootPath, location.path)) {
    return undefined
  }
  const { range } = location
  return {
    id: stored.id,
    kind: 'comment',
    path: location.path,
    startLine: range?.startLine ?? 0,
    startColumn: range === undefined ? undefined : startColumnOf(range),
    endLine: range?.endLine ?? 0,
    endColumn: range === undefined ? undefined : endColumnOf(range),
    text,
    author: stored.record.author,
    filePath: `${rootPath}/${location.path}`,
    rootPath,
    revision: location.commit,
    state: commentWord(isShared(stored.ref), stored.commit === WORKTREE, unshared, record.resolved),
    folder: '',
    patternRule: '',
    resolved: record.resolved,
  }
}
