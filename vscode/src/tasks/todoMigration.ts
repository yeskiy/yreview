import { type HandleKey, type HandleMatch, matchKey } from '../core/handles'
import { legacyTodoId } from '../core/taskIds'
import type { ReviewTask } from './reviewTask'

/** What a value of an older build names among the open TODO items, by path digest and line. */
export const legacyMatch = (key: HandleKey, open: readonly ReviewTask[]): HandleMatch =>
  matchKey(
    key,
    open
      .filter((task) => task.kind === 'todo')
      .map((task) => legacyTodoId(task.path, task.startLine)),
  )
