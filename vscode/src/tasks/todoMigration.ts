import { type HandleKey, type HandleMatch, handleOf, matchKey } from '../core/handles'
import {
  TASKS_VERSION,
  type TaskDocument,
  type TaskEntry,
  type TaskKind,
} from '../core/taskDocument'
import { isHandle, legacyTodoId, normalTodoText } from '../core/taskIds'
import type { ReviewTask } from './reviewTask'

/** What a value of an older build names among the open TODO items, by path digest and line. */
export const legacyMatch = (key: HandleKey, open: readonly ReviewTask[]): HandleMatch =>
  matchKey(
    key,
    open
      .filter((task) => task.kind === 'todo')
      .map((task) => legacyTodoId(task.path, task.startLine)),
  )

/** The fields of an open item that the migration reads. A `ReviewTask` has all of them. */
export interface OpenTodo {
  readonly id: string
  readonly kind: TaskKind
  readonly path: string
  readonly startLine: number
  readonly text: string
  readonly rootPath: string
}

/** One item of the list, or undefined when none or more than one item passes the test. */
const single = <T>(items: readonly T[], test: (item: T) => boolean = () => true): T | undefined => {
  const hits = items.filter(test)
  return hits.length === 1 ? hits[0] : undefined
}

const moved = (entry: TaskEntry, open: readonly OpenTodo[]): TaskEntry | undefined => {
  if (entry.kind !== 'todo') return undefined
  if (handleOf(entry.id) !== handleOf(legacyTodoId(entry.path, entry.startLine))) return undefined
  const atLine = open.filter(
    (item) => item.path === entry.path && item.startLine === entry.startLine,
  )
  const hit =
    single(atLine) ??
    single(atLine, (item) => normalTodoText(item.text) === normalTodoText(entry.text))
  if (hit === undefined) return undefined
  return { ...entry, id: isHandle(entry.id) ? handleOf(hit.id) : hit.id }
}

/** A version 1 file with each older TODO identifier moved to the item at the same path and line. */
export const migrateDocument = (
  document: TaskDocument,
  open: readonly OpenTodo[],
): TaskDocument => {
  if (document.version >= TASKS_VERSION) return document
  const here = open.filter((item) => item.kind === 'todo' && item.rootPath === document.repository)
  return {
    ...document,
    version: TASKS_VERSION,
    tasks: document.tasks.map((entry) => moved(entry, here) ?? entry),
  }
}
