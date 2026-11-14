import path from 'node:path'

/** The key of a record that no commit holds. It is not hexadecimal, so it is never a commit. */
export const WORKTREE = 'worktree'

/** What the store rule answers for one file. Port of AnchorPlan. */
export type AnchorPlan =
  | { readonly kind: 'git'; readonly root: string; readonly commit: string; readonly path: string }
  | { readonly kind: 'folder'; readonly root: string; readonly path: string }
  | { readonly kind: 'noCommit' }
  | { readonly kind: 'noPlace' }

const NO_COMMIT: AnchorPlan = { kind: 'noCommit' }
const NO_PLACE: AnchorPlan = { kind: 'noPlace' }

/** The path with `/` as the separator. The rules compare paths in this form only. */
export const slashPath = (native: string): string => native.split(path.sep).join('/')

/** True when the root is the file or an ancestor of it. A name prefix is not an ancestor. */
export const holds = (root: string, filePath: string): boolean =>
  filePath === root || filePath.startsWith(`${root}/`)

/** The path of the file under the root, or undefined when the root does not hold the file. */
export const relativeTo = (filePath: string, root: string): string | undefined =>
  filePath.startsWith(`${root}/`) && filePath.length > root.length + 1
    ? filePath.slice(root.length + 1)
    : undefined

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

/** The store rule for one file. The project thunks run only when no repository holds the file. */
export const planAnchor = (
  filePath: string,
  repositoryRoot: string | undefined,
  head: string | undefined,
  projectDir: () => string | undefined,
  contentRoots: () => readonly string[],
): AnchorPlan => {
  if (repositoryRoot !== undefined) {
    if (head === undefined) return NO_COMMIT
    const relative = relativeTo(filePath, repositoryRoot)
    return relative === undefined
      ? NO_PLACE
      : { kind: 'git', root: repositoryRoot, commit: head, path: relative }
  }
  const root = folderRoot(filePath, projectDir(), contentRoots())
  const relative = root === undefined ? undefined : relativeTo(filePath, root)
  return root === undefined || relative === undefined
    ? NO_PLACE
    : { kind: 'folder', root, path: relative }
}
