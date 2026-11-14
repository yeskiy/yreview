import { kotlinTrim } from '../core/kotlinText'
import { compactRange, hasColumns } from '../core/range'
import type { ReviewTask } from './reviewTask'
import { cleanPath, cleanText, cutText } from './taskText'
import { type TaskFolder, type TaskGroup, tasksOfFolder } from './taskTree'

export const ROW_LIMIT = 100
export const MORE = '...'
export const TOOLTIP_LIMIT = 2_000
export const TOOLTIP_LINES = 20

const LINE_BREAK = /\r\n|\r|\n/

const textLines = (text: string): readonly string[] =>
  text
    .split(LINE_BREAK)
    .map(kotlinTrim)
    .filter((line) => line !== '')

export const countOf = (value: number, name: string): string =>
  `${value} ${name}${value === 1 ? '' : 's'}`

export const linesOf = (task: ReviewTask): string => {
  if (hasColumns(task.startColumn, task.endColumn)) return compactRange(task)
  return task.endLine <= task.startLine ? `${task.startLine}` : `${task.startLine}-${task.endLine}`
}

/** One line of text for a row. A longer text ends with MORE. */
export const rowText = (text: string): string => {
  const lines = textLines(text)
  const first = lines[0] ?? ''
  const short = kotlinTrim(cutText(first, ROW_LIMIT))
  return short.length < first.length || lines.length > 1 ? `${short}${MORE}` : short
}

export const firstLine = (text: string): string => textLines(text)[0] ?? ''

export const taskTitle = (task: ReviewTask): string => `${linesOf(task)}: ${rowText(task.text)}`

/** A comment shows how it is stored, and a TODO shows its word. */
export const taskState = (task: ReviewTask): string =>
  task.kind === 'todo' ? (task.pattern ?? '') : task.state

export const fileTitle = (group: TaskGroup): string => group.name

export const fileCount = (group: TaskGroup): string => countOf(group.tasks.length, 'task')

export const folderTitle = (folder: TaskFolder): string => folder.name

export const folderCount = (folder: TaskFolder): string =>
  countOf(tasksOfFolder(folder).length, 'task')

export const tooltipPlace = (task: ReviewTask): string => `${task.path}:${linesOf(task)}`

/** The lines of a tooltip, bound by TOOLTIP_LIMIT characters and TOOLTIP_LINES lines. */
export const tooltipLines = (text: string): readonly string[] => {
  const trimmed = kotlinTrim(text)
  const rows = cutText(trimmed, TOOLTIP_LIMIT).split(LINE_BREAK)
  const kept = rows.slice(0, TOOLTIP_LINES)
  return kept.length < rows.length || trimmed.length > TOOLTIP_LIMIT ? [...kept, MORE] : kept
}

/** One task for the clipboard. The identifier stays whole, because an agent copies it back. */
export const plainText = (task: ReviewTask): string =>
  `${task.id} ${task.kind === 'todo' ? 'todo' : 'comment'} ${cleanPath(task.path)}:${linesOf(task)}\n${kotlinTrim(
    cleanText(task.text),
  )}`
