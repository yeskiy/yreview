import * as vscode from 'vscode'

export type YreviewApi = Record<string, never>

export const activate = (context: vscode.ExtensionContext): YreviewApi => {
  const output = vscode.window.createOutputChannel('Yreview', { log: true })
  context.subscriptions.push(
    output,
    vscode.commands.registerCommand('yreview.showLog', () => output.show(true)),
  )
  return {}
}

export const deactivate = (): void => undefined
