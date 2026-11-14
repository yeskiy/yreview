import * as vscode from 'vscode'

import type { Log } from './log'

/** Runs one command handler. A failure goes to the log and to an error message. */
export const guard =
  <A extends unknown[]>(log: Log, what: string, handler: (...args: A) => Promise<void>) =>
  async (...args: A): Promise<void> => {
    try {
      await handler(...args)
    } catch (error) {
      log.error(`${what} failed.`, error)
      await vscode.window.showErrorMessage(
        `${what} failed. ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
