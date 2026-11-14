import { WORKTREE } from '../core/anchor'
import type { ReviewTask } from '../tasks/reviewTask'
import { countOf, plainText } from '../tasks/taskLabels'
import { GUIDE_NAME } from './agentGuide'
import { TASKS_NAME } from './handoffFiles'

const SHORT_COMMIT = 7

/** The short prompt of a send that did not reach a session: the two files, the counts, the tasks. */
export const handoffPrompt = (
  folder: string,
  commit: string,
  tasks: readonly ReviewTask[],
): string =>
  `Read ${folder}/${GUIDE_NAME}, then work through ${folder}/${TASKS_NAME}.\n${countOf(
    tasks.length,
    'open task',
  )} in ${countOf(new Set(tasks.map((task) => task.path)).size, 'file')}${
    commit === '' || commit === WORKTREE ? '' : ` at commit ${commit.slice(0, SHORT_COMMIT)}`
  }.\n\n${tasks.map(plainText).join('\n\n')}`
