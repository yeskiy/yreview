import assert from 'node:assert/strict'
import { setTimeout as wait } from 'node:timers/promises'

import * as vscode from 'vscode'

export const until = async (check: () => boolean, tries = 40): Promise<boolean> =>
  check() || (tries > 0 && wait(250).then(() => until(check, tries - 1)))

/** A test window can start without OS focus. VS Code 1.101 has no command that gives it the focus. */
export const focusWindow = async (): Promise<void> => {
  const command = 'workbench.action.focusWindow'
  if (!vscode.window.state.focused && (await vscode.commands.getCommands(true)).includes(command))
    await vscode.commands.executeCommand(command)
  assert.ok(await until(() => vscode.window.state.focused, 20), 'the VS Code window has no focus')
}
