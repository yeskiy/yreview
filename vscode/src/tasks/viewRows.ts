import { type ChangeFacts, changesEmptyText, keepChanged } from './changeTab'
import type { ReviewTask } from './reviewTask'
import type { TabState } from './tabState'
import { KIND_FILTERS, type TodoFilter, acceptsResolved, applyFilter } from './taskFilter'
import { checkKey } from './taskChecks'
import type { RepositoryTasks } from './taskScan'
import {
  type TaskFolder,
  type TaskGroup,
  type TaskLayout,
  groupTasks,
  layoutTasks,
  tasksOfFolder,
  tasksOfLayout,
} from './taskTree'

export type ViewKey = 'project' | 'currentFile' | 'changes'

export const VIEW_KEYS: readonly ViewKey[] = ['project', 'currentFile', 'changes']

export const viewIdOf = (key: ViewKey): string => `yreview.${key}`

interface RowBase {
  readonly id: string
  /** The tasks under the row, for the check boxes and the writes. */
  readonly tasks: readonly ReviewTask[]
}

/** One row of a task view. */
export type Row =
  | (RowBase & { readonly kind: 'folder'; readonly folder: TaskFolder })
  | (RowBase & { readonly kind: 'file'; readonly group: TaskGroup })
  | (RowBase & { readonly kind: 'task'; readonly task: ReviewTask })

export interface ViewInput {
  readonly repositories: readonly RepositoryTasks[]
  readonly tab: TabState
  readonly filters: readonly TodoFilter[]
  readonly folderOf: (task: ReviewTask) => string
  readonly changed?: ReadonlySet<string>
  readonly keep: (task: ReviewTask) => boolean
}

export interface DerivedView {
  readonly layout: TaskLayout
  readonly tasks: readonly ReviewTask[]
}

export const NO_TASK = 'This view has no open review task.'
export const NO_FILE = 'Open a file to see its review tasks.'

/** The key of a file path for a set. Windows paths ignore the case. */
export const pathKey = (value: string, platform: NodeJS.Platform = process.platform): string => {
  const plain = value.replaceAll('\\', '/')
  return platform === 'win32' ? plain.toLowerCase() : plain
}

/** A workspace with several repositories shows the repository name in front of the path. */
export const labelOf = (task: ReviewTask, several: boolean): string =>
  several ? `${task.rootPath.slice(task.rootPath.lastIndexOf('/') + 1)}/${task.path}` : task.path

/** The patterns of the chosen TODO filter. Undefined when no filter is on or the settings lost it. */
export const rulesOf = (
  tab: TabState,
  filters: readonly TodoFilter[],
): ReadonlySet<string> | undefined => {
  if (tab.todoFilterName === '') return undefined
  const filter = filters.find((entry) => entry.name === tab.todoFilterName)
  return filter === undefined ? undefined : new Set(filter.patterns)
}

export const deriveView = (input: ViewInput): DerivedView => {
  const all = input.repositories
    .flatMap((repo) => repo.tasks)
    .map((task) => ({ ...task, folder: input.folderOf(task) }))
    .filter((task) => acceptsResolved(task, input.tab.showResolved) && input.keep(task))
  const layout = layoutTasks(
    groupTasks(
      applyFilter(
        input.changed === undefined ? all : keepChanged(all, input.changed),
        rulesOf(input.tab, input.filters),
        input.tab.kindFilter,
      ),
      (task) => labelOf(task, input.repositories.length > 1),
    ),
    input.tab,
  )
  return { layout, tasks: tasksOfLayout(layout) }
}

export const rowsOfLayout = (parent: string, layout: TaskLayout): readonly Row[] => [
  ...layout.folders.map((folder): Row => ({
    kind: 'folder',
    id: `${parent}/d:${folder.name}`,
    folder,
    tasks: tasksOfFolder(folder),
  })),
  ...layout.files.map((group): Row => ({
    kind: 'file',
    id: `${parent}/f:${group.path}`,
    group,
    tasks: group.tasks,
  })),
]

export const childRows = (row: Row): readonly Row[] => {
  if (row.kind === 'folder') return rowsOfLayout(row.id, row.folder)
  if (row.kind === 'file') {
    return row.group.tasks.map((task): Row => ({
      kind: 'task',
      id: `${row.id}/t:${checkKey(task)}`,
      task,
      tasks: [task],
    }))
  }
  return []
}

/** The words that a view shows when a scan ran to the end and found nothing. */
export const finishedText = (key: ViewKey, changes: ChangeFacts, hasFile: boolean): string => {
  if (key === 'changes') return changesEmptyText(changes)
  return key === 'currentFile' && !hasFile ? NO_FILE : NO_TASK
}

/** The words beside the view title. They name each choice that differs from the default. */
export const viewDescription = (tab: TabState): string | undefined => {
  const parts = [
    tab.kindFilter === 'both'
      ? ''
      : (KIND_FILTERS.find((entry) => entry.kind === tab.kindFilter)?.label ?? ''),
    tab.todoFilterName,
    tab.scopeGlob,
    tab.showResolved ? 'resolved shown' : '',
  ].filter((part) => part !== '')
  return parts.length === 0 ? undefined : parts.join(', ')
}
