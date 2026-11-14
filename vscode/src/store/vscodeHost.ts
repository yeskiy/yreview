import * as vscode from 'vscode'

import { FETCH_REFSPEC } from '../git/sharing'
import { readSettings } from '../settings'
import type { RefspecAnswer, ServiceHost } from './reviewService'

const DECLINED = 'yreview.refspecDeclined'
const ADD = 'Add'
const NEVER = 'Do not ask again'

/** The editor side of the review service. The "Do not ask again" roots stay in the given state. */
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
  declinedRoots: () => {
    const stored = state.get<unknown>(DECLINED)
    return Array.isArray(stored)
      ? stored.filter((root): root is string => typeof root === 'string')
      : []
  },
  saveDeclinedRoots: (roots) => Promise.resolve(state.update(DECLINED, roots)),
  warn: (message) => {
    vscode.window.showWarningMessage(message)
  },
})
