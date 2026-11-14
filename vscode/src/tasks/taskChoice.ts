import type { ReviewTask } from './reviewTask'
import { countOf } from './taskLabels'

export type SendScope = 'checked' | 'selected' | 'all' | 'none'
export type WriteScope = 'checked' | 'selected' | 'none'

export interface SendTarget {
  readonly scope: SendScope
  readonly tasks: readonly ReviewTask[]
}

/** A resolve takes the comments only. A delete takes both kinds. */
export interface WriteTarget {
  readonly scope: WriteScope
  readonly comments: readonly ReviewTask[]
  readonly todos: readonly ReviewTask[]
}

export interface ToolbarFacts {
  readonly send: SendTarget
  readonly write: WriteTarget
  readonly anyTask: boolean
  readonly anyCheck: boolean
}

const NO_TASK = 'This workspace has no open review task.'

/** A check box beats a selected row, and a selected row beats the whole tree. */
export const sendTarget = (
  checked: readonly ReviewTask[],
  selected: readonly ReviewTask[],
  all: readonly ReviewTask[],
): SendTarget => {
  if (checked.length > 0) return { scope: 'checked', tasks: checked }
  if (selected.length > 0) return { scope: 'selected', tasks: selected }
  return all.length > 0 ? { scope: 'all', tasks: all } : { scope: 'none', tasks: [] }
}

const target = (scope: WriteScope, rows: readonly ReviewTask[]): WriteTarget => ({
  scope,
  comments: [
    ...new Map(
      rows.filter((row) => row.kind === 'comment').map((row) => [row.id, row] as const),
    ).values(),
  ],
  todos: rows.filter((row) => row.kind === 'todo'),
})

/** A write never falls back to the whole tree. */
export const writeTarget = (
  checked: readonly ReviewTask[],
  selected: readonly ReviewTask[],
): WriteTarget => {
  if (checked.length > 0) return target('checked', checked)
  return selected.length > 0
    ? target('selected', selected)
    : { scope: 'none', comments: [], todos: [] }
}

export const sendText = (send: SendTarget): string =>
  ({
    checked: `Send Checked (${send.tasks.length})`,
    selected: `Send Selected (${send.tasks.length})`,
    all: `Send All (${send.tasks.length})`,
    none: 'Send to the Agent',
  })[send.scope]

export const sendDescription = (send: SendTarget): string =>
  ({
    checked: `Send the ${countOf(send.tasks.length, 'checked task')} to the agent.`,
    selected: `Send the ${countOf(send.tasks.length, 'selected row')} to the agent.`,
    all: `No row is checked, so the whole tree goes out. It holds ${countOf(send.tasks.length, 'task')}.`,
    none: NO_TASK,
  })[send.scope]

export const copyText = (send: SendTarget): string =>
  ({
    checked: `Copy Checked (${send.tasks.length})`,
    selected: `Copy Selected (${send.tasks.length})`,
    all: `Copy All (${send.tasks.length})`,
    none: 'Copy for an Agent',
  })[send.scope]

export const copyDescription = (send: SendTarget): string =>
  ({
    checked: `Copy the ${countOf(send.tasks.length, 'checked task')} to the clipboard, as a prompt for an agent.`,
    selected: `Copy the ${countOf(send.tasks.length, 'selected row')} to the clipboard, as a prompt for an agent.`,
    all: `No row is checked, so the whole tree goes to the clipboard. It holds ${countOf(send.tasks.length, 'task')}.`,
    none: NO_TASK,
  })[send.scope]

export const isEmptyTarget = (write: WriteTarget): boolean =>
  write.comments.length === 0 && write.todos.length === 0

export const hasComments = (write: WriteTarget): boolean => write.comments.length > 0

/** The question of the delete dialog. It starts with the risk and names both counts. */
export const deleteQuestion = (write: WriteTarget): string =>
  [
    write.comments.length === 0
      ? undefined
      : `You cannot put a review comment back. The extension removes ${countOf(write.comments.length, 'review comment')} from the git notes.`,
    write.todos.length === 0
      ? undefined
      : `The extension removes ${countOf(write.todos.length, 'TODO item')} from the source. The files stay unsaved, and an undo in each file puts the text back.`,
  ]
    .filter((part) => part !== undefined)
    .join(' ')

export const todoNotice = (write: WriteTarget): string =>
  write.todos.length === 0
    ? ''
    : `A TODO lives in the source file and not in a note. The extension kept ${countOf(write.todos.length, 'TODO row')}.`

export const previewTask = (
  selected: readonly ReviewTask[],
  all: readonly ReviewTask[],
): ReviewTask | undefined => selected[0] ?? all[0]

/** -1 when there is no next row. */
export const nextIndex = (size: number, current: number): number =>
  current + 1 < size ? current + 1 : -1

/** A tree with no selection ends on the last row. -1 when there is no previous row. */
export const previousIndex = (size: number, current: number): number => {
  if (current < 0) return size - 1
  return current > 0 ? current - 1 : -1
}

/** A filter can hide a checked row, so checkCount can pass the size of checked. */
export const toolbarFacts = (
  all: readonly ReviewTask[],
  selected: readonly ReviewTask[],
  checked: readonly ReviewTask[],
  checkCount: number,
): ToolbarFacts => ({
  send: sendTarget(checked, selected, all),
  write: writeTarget(checked, selected),
  anyTask: all.length > 0,
  anyCheck: checkCount > 0,
})

export const EMPTY_FACTS: ToolbarFacts = toolbarFacts([], [], [], 0)
