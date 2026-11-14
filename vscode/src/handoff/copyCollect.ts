import { handleOf } from '../core/handles'
import type { ReviewTask } from '../tasks/reviewTask'
import { type PromptFolder, copyPrompt } from './copyPrompt'
import type { HandoffStore, WrittenHandoff } from './handoffWriter'

export interface CopyOutcome {
  readonly text: string
  readonly tasks: number
  readonly folders: number
  readonly unwritten: readonly string[]
}

const nameOf = (root: string): string => root.split(/[\\/]/).pop() ?? root

/** Groups the tasks by store in the order of the list, writes each group, and builds one prompt. */
export const collectPrompt = async (
  tasks: readonly ReviewTask[],
  roots: readonly HandoffStore[],
  write: (store: HandoffStore, tasks: readonly ReviewTask[]) => Promise<WrittenHandoff | undefined>,
): Promise<CopyOutcome> => {
  // The clipboard reaches an agent, so every task carries its short handle from here.
  const outward = tasks.map((task) => ({ ...task, id: handleOf(task.id) }))
  const folders = await Promise.all(
    [...new Set(outward.map((task) => task.rootPath))].map(async (root): Promise<PromptFolder> => {
      const group = outward.filter((task) => task.rootPath === root)
      const store = roots.find((candidate) => candidate.root === root)
      const written = store === undefined ? undefined : await write(store, group)
      return {
        store: store?.kind ?? 'git',
        name: nameOf(root),
        root,
        done: written?.files.done.replaceAll('\\', '/') ?? '',
        commit: written?.commit ?? '',
        tasks: group,
        written: written !== undefined,
      }
    }),
  )
  return {
    text: copyPrompt(folders),
    tasks: outward.length,
    folders: folders.length,
    unwritten: folders.filter((folder) => !folder.written).map((folder) => folder.name),
  }
}
