import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'

import { handleOf } from '../core/handles'
import {
  TASKS_VERSION,
  type TaskDocument,
  type TaskEntry,
  decodeTaskDocument,
} from '../core/taskDocument'
import { legacyTodoId } from '../core/taskIds'
import type { Log } from '../log'
import { type OpenTodo, migrateDocument } from '../tasks/todoMigration'
import { HandoffFiles } from './handoffFiles'

/** One read never takes more than this. A larger file answers with nothing. */
export const MAX_TASK_FILE_BYTES = 2 ** 22

/** An agent works in the same folder, so a file that the reader cannot use answers with nothing. */
const readDocument = async (file: string, maxBytes: number): Promise<TaskDocument | undefined> => {
  const size = await stat(file).then(
    (info) => info.size,
    () => undefined,
  )
  if (size === undefined || size > maxBytes) return undefined
  return readFile(file, 'utf8').then(decodeTaskDocument, () => undefined)
}

/** Writes a version 1 file again with current TODO identifiers. The version makes it run once. */
export const migrateTaskFile = async (
  file: string,
  open: readonly OpenTodo[],
  log: Pick<Log, 'warn'>,
  maxBytes = MAX_TASK_FILE_BYTES,
): Promise<void> => {
  const document = await readDocument(file, maxBytes)
  if (document === undefined || document.version >= TASKS_VERSION) return
  await new HandoffFiles(path.dirname(file))
    .writeTasks(migrateDocument(document, open))
    .catch((error: unknown) =>
      log.warn(`The extension did not migrate a task file. ${String(error)}`),
    )
}

/** The handle of each task, and for a TODO also the handle that an older build made for its line. */
const handlesOf = (task: TaskEntry): readonly string[] => [
  handleOf(task.id),
  ...(task.kind === 'todo' ? [handleOf(legacyTodoId(task.path, task.startLine))] : []),
]

export const sentHandles = async (
  file: string,
  maxBytes = MAX_TASK_FILE_BYTES,
): Promise<ReadonlySet<string>> =>
  new Set((await readDocument(file, maxBytes))?.tasks.flatMap(handlesOf) ?? [])

/** The handles that this window handed out, in one set. Each file is migrated first. */
export const sentHandlesOf = async (
  files: readonly string[],
  open: readonly OpenTodo[],
  log: Pick<Log, 'warn'>,
): Promise<ReadonlySet<string>> => {
  await Promise.all(files.map((file) => migrateTaskFile(file, open, log)))
  return new Set(
    (await Promise.all(files.map((file) => sentHandles(file)))).flatMap((handles) => [...handles]),
  )
}
