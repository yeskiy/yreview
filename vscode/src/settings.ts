import * as vscode from 'vscode'

import { type TodoFilter, readFilters } from './tasks/taskFilter'
import { type TodoPattern, readPatterns } from './tasks/todoPatterns'

export interface Settings {
  readonly newComments: 'local' | 'shared'
  readonly remote: string
  readonly writeRefspec: boolean
  readonly editorMarks: boolean
}

export const readSettings = (scope?: vscode.Uri): Settings => {
  const config = vscode.workspace.getConfiguration('yreview', scope)
  return {
    newComments: config.get<string>('newComments') === 'shared' ? 'shared' : 'local',
    remote: config.get<string>('remote', 'origin').trim() || 'origin',
    writeRefspec: config.get<boolean>('writeRefspec', true),
    editorMarks: config.get<boolean>('editorMarks', true),
  }
}

export interface TaskSettings {
  readonly todoPatterns: readonly TodoPattern[]
  readonly todoFilters: readonly TodoFilter[]
}

/** The user value or the default. A workspace value of an application setting never counts. */
const userValue = (name: string): unknown => {
  const found = vscode.workspace.getConfiguration('yreview').inspect<unknown>(name)
  return found?.globalValue ?? found?.defaultValue
}

export const readTaskSettings = (): TaskSettings => ({
  todoPatterns: readPatterns(userValue('todoPatterns')),
  todoFilters: readFilters(userValue('todoFilters')),
})
