import * as vscode from 'vscode'

/** The settings editor of VS Code holds every setting of Yreview. */
export const registerSettingsPage = (): vscode.Disposable =>
  vscode.commands.registerCommand('yreview.openSettings', () =>
    vscode.commands.executeCommand('workbench.action.openSettings', '@ext:yeskiy.yreview'),
  )
