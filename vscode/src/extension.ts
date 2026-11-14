import { homedir } from 'node:os'

import * as vscode from 'vscode'

import { offerIntellijKey } from './keyOffer'
import { redactingLog } from './log'

export type YreviewApi = Record<string, never>

export const activate = (context: vscode.ExtensionContext): YreviewApi => {
  const output = vscode.window.createOutputChannel('Yreview', { log: true })
  const log = redactingLog(output, () => ({
    homes: [process.env.USERPROFILE ?? '', homedir()].filter((home) => home !== ''),
    projects: (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath),
    repositories: [],
  }))
  context.subscriptions.push(
    output,
    vscode.commands.registerCommand('yreview.showLog', () => output.show(true)),
  )
  offerIntellijKey(context.globalState).catch((error: unknown) =>
    log.error('The key offer failed.', error),
  )
  log.info('Yreview started.')
  return {}
}

export const deactivate = (): void => undefined
