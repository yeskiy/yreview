import path from 'node:path'

import { WORKTREE } from '../core/anchor'
import { TASKS_VERSION } from '../core/taskDocument'
import { gitDirOf } from '../git/gitDir'
import { ProcessGitRunner, isOk } from '../git/runner'
import type { Log } from '../log'
import type { ReviewService, StoreKind } from '../store/reviewService'
import type { ReviewTask } from '../tasks/reviewTask'
import { HandoffFiles, TASKS_NAME } from './handoffFiles'
import { folderLabel, handoffFolder } from './handoffPlace'

/** One store of the window: a repository root, or a folder store root. */
export interface HandoffStore {
  readonly kind: StoreKind
  readonly root: string
}

/** The repository roots of the task model, then the folder stores. An agent read moves no folder. */
export const handoffStores = async (
  gitRoots: () => readonly string[],
  service: Pick<ReviewService, 'folderStores'>,
): Promise<readonly HandoffStore[]> => [
  ...gitRoots().map((root): HandoffStore => ({ kind: 'git', root })),
  ...(await service.folderStores(false)).map(({ root }): HandoffStore => ({
    kind: 'folder',
    root,
  })),
]

export interface HandoffDeps {
  readonly gitPath: string
  readonly windowPath: () => string
  /** Starts the poll of one done file. */
  readonly watch: (done: string) => void
  readonly log: Log
  readonly now: () => Date
}

export interface WrittenHandoff {
  readonly files: HandoffFiles
  readonly label: string
  readonly commit: string
}

/** The workspace file of a multi-root window, else its first folder, else nothing. */
export const windowPathOf = (
  workspaceFile: { readonly scheme: string; readonly fsPath: string } | undefined,
  folders: readonly string[],
): string => (workspaceFile?.scheme === 'file' ? workspaceFile.fsPath : (folders[0] ?? ''))

/** ISO 8601 in UTC with whole seconds, as the Kotlin writer gives it. */
export const isoSeconds = (date: Date): string => date.toISOString().replace(/\.\d{3}Z$/, 'Z')

const folderOf = async (deps: HandoffDeps, store: HandoffStore): Promise<string | undefined> =>
  handoffFolder(
    store.kind,
    store.root,
    store.kind === 'git'
      ? await gitDirOf(new ProcessGitRunner(store.root, deps.gitPath))
      : undefined,
    deps.windowPath(),
  )

/** The task file of this window for one store, or undefined when git named no git directory. */
export const taskFileOf = async (
  deps: HandoffDeps,
  store: HandoffStore,
): Promise<string | undefined> => {
  const folder = await folderOf(deps, store)
  return folder === undefined ? undefined : path.join(folder, TASKS_NAME)
}

const headOf = async (deps: HandoffDeps, store: HandoffStore): Promise<string> => {
  if (store.kind === 'folder') return WORKTREE
  const result = await new ProcessGitRunner(store.root, deps.gitPath).run([
    'rev-parse',
    '-q',
    '--verify',
    'HEAD^{commit}',
  ])
  return isOk(result) ? result.stdout.trim() : ''
}

/** The rules and the tasks of one store, on every send and every copy. Undefined after a failure. */
export const writeHandoff = async (
  deps: HandoffDeps,
  store: HandoffStore,
  tasks: readonly ReviewTask[],
): Promise<WrittenHandoff | undefined> => {
  const folder = await folderOf(deps, store)
  if (folder === undefined) return undefined
  const files = new HandoffFiles(folder)
  const commit = await headOf(deps, store)
  try {
    await files.write({
      version: TASKS_VERSION,
      repository: store.root.replaceAll('\\', '/'),
      commit,
      generated: isoSeconds(deps.now()),
      tasks,
    })
  } catch (error) {
    deps.log.error('The extension did not write the task files.', error)
    return undefined
  }
  deps.watch(files.done)
  return { files, label: folderLabel(folder, store.root), commit }
}
