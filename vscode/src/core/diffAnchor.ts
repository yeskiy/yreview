import { WORKTREE, relativeTo } from './anchor'
import { isKotlinBlank } from './kotlinText'

export type DiffSide = 'left' | 'right'

export interface DiffAnchor {
  readonly side: DiffSide
  readonly commit: string
  readonly path: string
  readonly dirty: boolean
}

/** A commit and the repository-relative path of one side. */
export interface Revision {
  readonly commit: string
  readonly path: string
}

/** What one diff knows about its two sides. Port of RevisionFacts. */
export interface RevisionFacts {
  readonly before?: Revision
  readonly after?: Revision
  /** The path of the right side. A file that git does not track yet has only this name. */
  readonly afterPath?: string
  readonly head?: string
}

/** Port of DiffAnchorResolver. Only the right side falls back to the head, and then it is dirty. */
export const resolveDiffAnchor = (facts: RevisionFacts, side: DiffSide): DiffAnchor | undefined => {
  const own = side === 'left' ? facts.before : facts.after
  if (own !== undefined) return { side, commit: own.commit, path: own.path, dirty: false }
  if (side === 'left' || facts.head === undefined) return undefined
  // The left path comes first, so a renamed file anchors under the name that the head holds.
  const relative = facts.before?.path ?? facts.afterPath
  return relative === undefined
    ? undefined
    : { side, commit: facts.head, path: relative, dirty: true }
}

/** One side of a change: a revision (blank for the working tree) and an absolute `/` path. */
export interface SideFile {
  readonly revision: string
  readonly file: string
}

export interface ChangeSides {
  readonly before?: SideFile
  readonly after?: SideFile
}

const revisionOf = (side: SideFile | undefined, root: string): Revision | undefined => {
  if (side === undefined || isKotlinBlank(side.revision)) return undefined
  const relative = relativeTo(side.file, root)
  return relative === undefined ? undefined : { commit: side.revision, path: relative }
}

/** The facts of one change. Port of ChangeRevisionFacts. */
export const changeFacts = (
  change: ChangeSides,
  head: string | undefined,
  root: string,
): RevisionFacts => ({
  before: revisionOf(change.before, root),
  after: revisionOf(change.after, root),
  afterPath: change.after === undefined ? undefined : relativeTo(change.after.file, root),
  head,
})

/** The query of a `git:` URI of the built-in git extension: the file and the ref of the side. */
export interface GitUriQuery {
  readonly path: string
  readonly ref: string
}

const MAX_QUERY = 4096

export const parseGitUriQuery = (query: string): GitUriQuery | undefined => {
  if (query.length > MAX_QUERY) return undefined
  const value: unknown = (() => {
    try {
      return JSON.parse(query)
    } catch {
      return undefined
    }
  })()
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const { path: file, ref } = value as Record<string, unknown>
  return typeof file === 'string' &&
    file !== '' &&
    !file.includes('\u0000') &&
    typeof ref === 'string'
    ? { path: file, ref }
    : undefined
}

export type RefKind =
  | { readonly kind: 'commit'; readonly rev: string }
  | { readonly kind: 'index' }
  | { readonly kind: 'indexOrHead' }
  | { readonly kind: 'none' }

// A revision name that git cannot read as an option, a path (`:`) or a range (`..`).
const SAFE_REV = /^[A-Za-z0-9_@][A-Za-z0-9_./~^@{}-]{0,255}$/u

/** `''` is the index, `~` the index or HEAD, and `~1` to `~3` a merge stage with no commit. */
export const refKindOf = (ref: string): RefKind => {
  if (ref === '') return { kind: 'index' }
  if (ref === '~') return { kind: 'indexOrHead' }
  if (SAFE_REV.test(ref) && !ref.includes('..')) return { kind: 'commit', rev: ref }
  return { kind: 'none' }
}

/** The revision part of a thread label, as CommentText.diffHeader writes it. */
export const revisionLabel = (commit: string, dirty: boolean): string =>
  `@${commit === WORKTREE ? 'working tree' : commit.slice(0, 7)}${dirty ? ' (working tree)' : ''}`
