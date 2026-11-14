import { FOLDER } from '../store/folderNotes'
import type { StoreKind } from '../store/reviewService'
import type { ReviewTask } from '../tasks/reviewTask'
import { countOf, plainText } from '../tasks/taskLabels'
import { RULES, TITLE } from './agentGuide'

export const EMPTY = 'No open review task is selected.'

const SHORT_COMMIT = 7

/** One folder of the prompt. `written` is false when the extension wrote no file there. */
export interface PromptFolder {
  readonly store: StoreKind
  readonly name: string
  readonly root: string
  readonly done: string
  readonly commit: string
  readonly tasks: readonly ReviewTask[]
  readonly written: boolean
}

const reportLine = (folder: PromptFolder): string =>
  folder.written
    ? `- Report a finished task in \`${folder.done}\`.`
    : '- Yreview writes no file for this folder, and it reads no report file here. Name every finished identifier in your answer instead.'

const commitLine = (folder: PromptFolder): readonly string[] =>
  folder.commit === ''
    ? []
    : [`- The tasks belong to the git commit ${folder.commit.slice(0, SHORT_COMMIT)}.`]

/** The closing instructions of one folder. Each kind of store answers here and nowhere else. */
export const closing = (folder: PromptFolder): string =>
  (folder.store === 'git'
    ? [
        `- The repository is \`${folder.root}\`.`,
        '- Every file path below starts from that folder.',
        ...commitLine(folder),
        reportLine(folder),
      ]
    : [
        `- The folder is \`${folder.root}\`.`,
        '- Every file path below starts from that folder.',
        `- No git repository holds this folder, so the comments live in the \`${FOLDER}\` folder and no commit belongs to them.`,
        reportLine(folder),
      ]
  ).join('\n')

const head = (groups: readonly PromptFolder[]): string =>
  `${TITLE}\n\nYou work through ${countOf(
    groups.reduce((sum, group) => sum + group.tasks.length, 0),
    'open review task',
  )} in ${countOf(groups.length, 'folder')}. Read the rules once. Each folder below names its own root and its own report file.`

const section = (index: number, size: number, folder: PromptFolder): string =>
  `## Folder ${index + 1} of ${size}: ${folder.name}\n\n${closing(folder)}\n\n${folder.tasks
    .map(plainText)
    .join('\n\n')}`

/** The rules first and whole, then one section for each folder that holds a task. */
export const copyPrompt = (folders: readonly PromptFolder[]): string => {
  const groups = folders.filter((folder) => folder.tasks.length > 0)
  return groups.length === 0
    ? EMPTY
    : [
        head(groups),
        RULES,
        ...groups.map((group, index) => section(index, groups.length, group)),
      ].join('\n\n')
}
