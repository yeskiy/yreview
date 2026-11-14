import path from 'node:path'

import { windowFolderName } from '../core/paths'
import { REVIEW_FOLDER } from '../git/gitDir'
import { FOLDER } from '../store/folderNotes'

// TODO: import StoreKind from '../store/reviewService' once task 2.4 adds it on main.
type StoreKind = 'git' | 'folder'

/** The IntelliJ plugin uses the bare window name, so both editors can open one folder. */
export const WINDOW_PREFIX = 'vscode-'

/** The folder that every window of one store shares. Undefined when git named no git directory. */
export const sharedPlace = (
  kind: StoreKind,
  root: string,
  gitDir: string | undefined,
): string | undefined => {
  if (kind === 'folder') return path.join(root, FOLDER)
  return gitDir === undefined ? undefined : path.join(gitDir, REVIEW_FOLDER)
}

/** The folder of one window. Two windows on one repository get two folders. */
export const handoffFolder = (
  kind: StoreKind,
  root: string,
  gitDir: string | undefined,
  windowPath: string,
): string | undefined => {
  const shared = sharedPlace(kind, root, gitDir)
  return shared === undefined
    ? undefined
    : path.join(shared, `${WINDOW_PREFIX}${windowFolderName(windowPath)}`)
}

/** Relative to the root when the folder is inside it, else the whole path. Always with `/`. */
export const folderLabel = (folder: string, root: string): string => {
  const relative = path.relative(path.resolve(root), path.resolve(folder))
  const outside =
    relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)
  return (outside ? path.resolve(folder) : relative).replaceAll('\\', '/')
}
