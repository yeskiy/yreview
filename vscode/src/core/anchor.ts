import path from 'node:path'

import { holds, isHomeFile, parentOf, relativeTo, storeWalk } from './storeRules'

export { holds, relativeTo } from './storeRules'

/** The key of a record that no commit holds. It is not hexadecimal, so it is never a commit. */
export const WORKTREE = 'worktree'

/** What the store rule answers for one file. Port of AnchorPlan. */
export type AnchorPlan =
  | { readonly kind: 'git'; readonly root: string; readonly commit: string; readonly path: string }
  | {
      readonly kind: 'folder'
      readonly root: string
      readonly path: string
      readonly exists: boolean
    }
  | { readonly kind: 'noCommit' }
  /** A file directly in the home folder or in the bridge folder. It gets no store. */
  | { readonly kind: 'homeFile' }
  | { readonly kind: 'noPlace' }

const NO_COMMIT: AnchorPlan = { kind: 'noCommit' }
const NO_PLACE: AnchorPlan = { kind: 'noPlace' }
const HOME_FILE: AnchorPlan = { kind: 'homeFile' }

/** The path with `/` as the separator. The rules compare paths in this form only. */
export const slashPath = (native: string): string => native.split(path.sep).join('/')

/** The project folder first, then the longest content root that holds the file. */
export const folderRoot = (
  filePath: string,
  projectDir: string | undefined,
  contentRoots: readonly string[],
): string | undefined =>
  projectDir !== undefined && holds(projectDir, filePath)
    ? projectDir
    : contentRoots
        .filter((root) => holds(root, filePath))
        .reduce<string | undefined>(
          (best, root) => (best === undefined || root.length > best.length ? root : best),
          undefined,
        )

/** True when this repository holds the file, and no repository inside it holds the file. */
export const ownsFile = (root: string, filePath: string, roots: readonly string[]): boolean =>
  holds(root, filePath) &&
  !roots.some((other) => other.length > root.length && holds(other, filePath))

const folderPlan = (filePath: string, root: string, exists: boolean): AnchorPlan => {
  const relative = relativeTo(filePath, root)
  return relative === undefined ? NO_PLACE : { kind: 'folder', root, path: relative, exists }
}

/** The store rule for one file. The workspace thunk runs only when no repository commit holds the file. */
export const planAnchor = (
  filePath: string,
  repositoryRoot: string | undefined,
  head: string | undefined,
  workspaceRoot: () => string | undefined,
  home: string | undefined,
  hasStore: (dir: string) => boolean,
): AnchorPlan => {
  if (repositoryRoot !== undefined && head !== undefined) {
    const relative = relativeTo(filePath, repositoryRoot)
    return relative === undefined
      ? NO_PLACE
      : { kind: 'git', root: repositoryRoot, commit: head, path: relative }
  }
  if (isHomeFile(filePath, home)) return HOME_FILE
  const dir = parentOf(filePath)
  if (dir === undefined) return NO_PLACE
  const workspace = workspaceRoot()
  const ceiling = workspace !== undefined && holds(workspace, dir) ? workspace : undefined
  const walk = storeWalk(dir, ceiling, home)
  const found = walk.find(hasStore)
  if (found !== undefined) return folderPlan(filePath, found, true)
  if (repositoryRoot !== undefined) return NO_COMMIT
  return folderPlan(
    filePath,
    ceiling !== undefined && walk.includes(ceiling) ? ceiling : dir,
    false,
  )
}
