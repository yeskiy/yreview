import * as vscode from 'vscode'

import type { Log } from './log'

const REPORT = 'Report'

/** Runs one command handler. A failure goes to the log, and to an error message with a Report button. */
export const guard =
  <A extends unknown[], R = void>(log: Log, what: string, handler: (...args: A) => Promise<R>) =>
  async (...args: A): Promise<R | undefined> => {
    try {
      return await handler(...args)
    } catch (error) {
      log.error(`${what} failed.`, error)
      const answer = await vscode.window.showErrorMessage(
        `${what} failed. ${error instanceof Error ? error.message : String(error)}`,
        REPORT,
      )
      if (answer === REPORT) {
        await vscode.commands.executeCommand('yreview.reportFailure', what, error)
      }
      return undefined
    }
  }
