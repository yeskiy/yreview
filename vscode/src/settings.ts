import * as vscode from 'vscode'

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
