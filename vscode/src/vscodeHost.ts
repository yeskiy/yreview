import * as vscode from 'vscode'

import { FETCH_REFSPEC } from './git/sharing'
import { readSettings } from './settings'
import type { RefspecAnswer, ServiceHost } from './store/reviewService'

const DECLINED = 'yreview.refspecDeclined'
const ADD = 'Add'
const NEVER = 'Do not ask again'
const TOLD = 'yreview.folderNoticeRoots'

const strings = (value: unknown): readonly string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

/** The editor side of the review service. The state keeps the declined roots and the told folders. */
export const vscodeHost = (state: vscode.Memento, git: string): ServiceHost => ({
  gitPath: () => git,
  settings: (root) => readSettings(vscode.Uri.file(root)),
  askRefspec: async (_root, name): Promise<RefspecAnswer> => {
    const answer = await vscode.window.showInformationMessage(
      `The remote of ${name} does not fetch the shared review comments. Add the fetch refspec ${FETCH_REFSPEC} to the git configuration of ${name}?`,
      ADD,
      NEVER,
    )
    if (answer === ADD) return 'add'
    return answer === NEVER ? 'never' : undefined
  },
  declinedRoots: () => strings(state.get<unknown>(DECLINED)),
  saveDeclinedRoots: (roots) => Promise.resolve(state.update(DECLINED, roots)),
  workspaceFolders: () =>
    (vscode.workspace.workspaceFolders ?? [])
      .filter((folder) => folder.uri.scheme === 'file')
      .map((folder) => folder.uri.fsPath),
  toldFolders: () => strings(state.get<unknown>(TOLD)),
  saveToldFolders: (roots) => Promise.resolve(state.update(TOLD, roots)),
  say: (message) => {
    vscode.window.showInformationMessage(message)
  },
  warn: (message) => {
    vscode.window.showWarningMessage(message)
  },
})
