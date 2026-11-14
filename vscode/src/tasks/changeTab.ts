import type { ReviewTask } from './reviewTask'

/** The changed files of every repository, each as root and path with `/`. */
export interface ChangeFacts {
  readonly gitFound: boolean
  readonly files: ReadonlySet<string>
}

export const NO_CHANGES: ChangeFacts = { gitFound: false, files: new Set() }

export const CHANGES_TITLE = 'Local Changes'

export const CHANGES_TOOLTIP = 'Every open review task of the files of the local changes.'

const NO_GIT = 'This workspace has no git repository.'

/** A change that deletes its file names no file, and two changes of one file give one path. */
export const changedFiles = (current: readonly (string | undefined)[]): ReadonlySet<string> =>
  new Set(current.filter((path): path is string => path !== undefined && path !== ''))

export const keepChanged = (
  tasks: readonly ReviewTask[],
  files: ReadonlySet<string>,
): readonly ReviewTask[] => tasks.filter((task) => files.has(task.filePath))

export const changesEmptyText = (facts: ChangeFacts): string => {
  if (!facts.gitFound) return NO_GIT
  return facts.files.size === 0
    ? 'No file is in the local changes.'
    : 'No open review task is in the local changes.'
}
