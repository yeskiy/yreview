import { kotlinTrim } from '../core/kotlinText'
import { NotesWriteError } from '../git/errors'
import type { DeleteResult } from '../store/reviewService'
import type { ReviewTask } from './reviewTask'
import { countOf, linesOf } from './taskLabels'

export interface RemoveReport {
  readonly removed: number
  readonly problems: readonly string[]
}

export interface TodoReport {
  readonly removed: number
  readonly missing: readonly string[]
  readonly problems: readonly string[]
}

export const placeOf = (task: ReviewTask): string => `${task.path}:${linesOf(task)}`

const nameOf = (root: string): string =>
  root.slice(Math.max(root.lastIndexOf('/'), root.lastIndexOf('\\')) + 1)

/** One delete for each repository. A refused note stops that repository only. */
export const removeComments = async (
  comments: readonly ReviewTask[],
  remove: (root: string, ids: readonly string[]) => Promise<DeleteResult>,
): Promise<RemoveReport> =>
  [
    ...comments.reduce(
      (byRoot, task) =>
        byRoot.set(task.rootPath, [...new Set([...(byRoot.get(task.rootPath) ?? []), task.id])]),
      new Map<string, readonly string[]>(),
    ),
  ].reduce<Promise<RemoveReport>>(
    async (done, [root, ids]) => {
      const report = await done
      try {
        const result = await remove(root, ids)
        return {
          removed: report.removed + result.removed,
          problems: [
            ...report.problems,
            ...(result.shareError === undefined ? [] : [result.shareError]),
          ],
        }
      } catch (failure) {
        if (!(failure instanceof NotesWriteError)) throw failure
        return {
          removed: report.removed,
          problems: [
            ...report.problems,
            `The extension could not write the note of ${nameOf(root)}. ${failure.message}`,
          ],
        }
      }
    },
    Promise.resolve({ removed: 0, problems: [] }),
  )

export const sharedMessage = (places: readonly string[]): string =>
  `The extension left ${countOf(places.length, 'TODO item')} in place: ${places.join(', ')}. The line of such an item also opens or closes a comment that holds other text. Delete that line by hand.`

export const noCommentMessage = (places: readonly string[]): string =>
  `The extension left ${countOf(places.length, 'TODO item')} in place: ${places.join(', ')}. The extension found no comment around such an item, so the item can be code. Delete it by hand.`

export const lockedMessage = (names: readonly string[]): string =>
  `The extension could not change ${names.join(', ')}. Make sure that the files can be written, then delete the rows again.`

const joined = (problems: readonly string[]): string | undefined =>
  problems.length === 0 ? undefined : problems.join(' ')

/** The one message after a delete. It names both counts, then each problem. */
export const deleteReport = (
  comments?: RemoveReport,
  todos?: TodoReport,
): { readonly text: string; readonly warn: boolean } => {
  const warnings = [
    comments === undefined ? undefined : joined(comments.problems),
    comments?.removed === 0 ? 'The git notes hold no line for that comment.' : undefined,
    todos === undefined ? undefined : joined(todos.problems),
    todos === undefined || todos.missing.length === 0
      ? undefined
      : `The extension did not find ${countOf(todos.missing.length, 'TODO item')}: ${todos.missing.join(', ')}. Read the tasks again.`,
  ].filter((part) => part !== undefined)
  const done = [
    comments === undefined ? undefined : countOf(comments.removed, 'review comment'),
    todos === undefined ? undefined : countOf(todos.removed, 'TODO item'),
  ]
    .filter((part) => part !== undefined)
    .join(' and ')
  return {
    text: kotlinTrim(`The extension deleted ${done}. ${warnings.join(' ')}`),
    warn: warnings.length > 0,
  }
}
