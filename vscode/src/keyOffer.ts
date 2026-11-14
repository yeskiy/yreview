import * as vscode from 'vscode'

import { runKeyOffer } from './keyOfferCore'

const ANSWER = 'yreview.intellijKeyAnswer'

export const offerIntellijKey = (state: vscode.Memento): Promise<void> =>
  runKeyOffer({
    answer: () => state.get<string>(ANSWER),
    saveAnswer: (value) => Promise.resolve(state.update(ANSWER, value)),
    ask: (message, ...items) =>
      Promise.resolve(vscode.window.showInformationMessage(message, ...items)),
    enableKey: () =>
      Promise.resolve(
        vscode.workspace
          .getConfiguration('yreview')
          .update('intellijKey', true, vscode.ConfigurationTarget.Global),
      ),
  })
