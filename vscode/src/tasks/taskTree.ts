import type { ReviewTask } from './reviewTask'

/** The tasks of one file, in line order. The name is the text the row shows. */
export interface TaskGroup {
  readonly path: string
  readonly tasks: readonly ReviewTask[]
  readonly name: string
}

/** A workspace folder row or a directory row. */
export type FolderKind = 'folder' | 'directory'

export interface TaskLayout {
  readonly folders: readonly TaskFolder[]
  readonly files: readonly TaskGroup[]
}

export interface TaskFolder extends TaskLayout {
  readonly name: string
  readonly kind: FolderKind
}

/** The flatten toggle works with byDirectory only. */
export interface TaskGrouping {
  readonly byFolder: boolean
  readonly byDirectory: boolean
  readonly flatten: boolean
}

/** The path of a comment comes from a note, so the tree stops nesting at this depth. */
export const MAX_DEPTH = 64

/** The UTF-16 order of Kotlin String.compareTo. */
export const byText = (a: string, b: string): number => {
  if (a < b) return -1
  return a > b ? 1 : 0
}

const ORDER = (a: ReviewTask, b: ReviewTask): number =>
  a.startLine - b.startLine || a.endLine - b.endLine || byText(a.id, b.id)

const groupBy = <T>(
  items: readonly T[],
  key: (item: T) => string,
): ReadonlyMap<string, readonly T[]> =>
  items.reduce(
    (map, item) => map.set(key(item), [...(map.get(key(item)) ?? []), item]),
    new Map<string, readonly T[]>(),
  )

const sortedEntries = <T>(map: ReadonlyMap<string, T>): readonly (readonly [string, T])[] =>
  [...map.entries()].sort(([a], [b]) => byText(a, b))

const distinctBy = <T>(items: readonly T[], key: (item: T) => string): readonly T[] => {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(key(item))) return false
    seen.add(key(item))
    return true
  })
}

export const rowsOf = (layout: TaskLayout): number => layout.folders.length + layout.files.length

export const groupTasks = (
  tasks: readonly ReviewTask[],
  label: (task: ReviewTask) => string = (task) => task.path,
): readonly TaskGroup[] =>
  sortedEntries(
    groupBy(
      distinctBy(tasks, (task) => `${task.filePath} ${task.id}`),
      label,
    ),
  ).map(([path, found]) => ({ path, name: path, tasks: [...found].sort(ORDER) }))

const segments = (group: TaskGroup): readonly string[] => group.path.split('/')

const folderOf = (group: TaskGroup): string => group.tasks[0]?.folder ?? ''

const sortedGroups = (groups: readonly TaskGroup[]): readonly TaskGroup[] =>
  [...groups].sort((a, b) => byText(a.path, b.path))

const short = (groups: readonly TaskGroup[]): readonly TaskGroup[] =>
  sortedGroups(groups).map((group) => ({
    ...group,
    name: group.path.slice(group.path.lastIndexOf('/') + 1),
  }))

const rest = (groups: readonly TaskGroup[], depth: number): readonly TaskGroup[] =>
  sortedGroups(groups).map((group) => ({ ...group, name: segments(group).slice(depth).join('/') }))

const folderRow = (name: string, kind: FolderKind, inside: TaskLayout): TaskFolder => ({
  name,
  kind,
  folders: inside.folders,
  files: inside.files,
})

const flat = (groups: readonly TaskGroup[]): TaskLayout => ({
  folders: sortedEntries(
    groupBy(
      groups.filter((group) => group.path.includes('/')),
      (group) => group.path.slice(0, group.path.lastIndexOf('/')),
    ),
  ).map(([name, inside]) => folderRow(name, 'directory', { folders: [], files: short(inside) })),
  files: sortedGroups(groups.filter((group) => !group.path.includes('/'))),
})

/** One folder row for each path segment, down to MAX_DEPTH. At the cap a file row shows the rest. */
const nest = (groups: readonly TaskGroup[], depth: number): TaskLayout => {
  if (depth >= MAX_DEPTH) return { folders: [], files: rest(groups, depth) }
  return {
    folders: sortedEntries(
      groupBy(
        groups.filter((group) => segments(group).length > depth + 1),
        (group) => segments(group)[depth] ?? '',
      ),
    ).map(([name, inside]) => folderRow(name, 'directory', nest(inside, depth + 1))),
    files: short(groups.filter((group) => segments(group).length <= depth + 1)),
  }
}

const directories = (groups: readonly TaskGroup[], grouping: TaskGrouping): TaskLayout => {
  if (!grouping.byDirectory) return { folders: [], files: sortedGroups(groups) }
  return grouping.flatten ? flat(groups) : nest(groups, 0)
}

export const layoutTasks = (groups: readonly TaskGroup[], grouping: TaskGrouping): TaskLayout => {
  if (!grouping.byFolder) return directories(groups, grouping)
  const outside = directories(
    groups.filter((group) => folderOf(group) === ''),
    grouping,
  )
  return {
    folders: [
      ...sortedEntries(
        groupBy(
          groups.filter((group) => folderOf(group) !== ''),
          folderOf,
        ),
      ).map(([name, inside]) => folderRow(name, 'folder', directories(inside, grouping))),
      ...outside.folders,
    ],
    files: outside.files,
  }
}

export const flattenGroups = (groups: readonly TaskGroup[]): readonly ReviewTask[] =>
  groups.flatMap((group) => group.tasks)

export const tasksOfFolder = (folder: TaskFolder): readonly ReviewTask[] => [
  ...folder.folders.flatMap(tasksOfFolder),
  ...flattenGroups(folder.files),
]

export const tasksOfLayout = (layout: TaskLayout): readonly ReviewTask[] => [
  ...layout.folders.flatMap(tasksOfFolder),
  ...flattenGroups(layout.files),
]
