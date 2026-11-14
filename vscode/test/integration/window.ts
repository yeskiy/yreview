import assert from 'node:assert/strict'
import { rm } from 'node:fs/promises'
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

interface GitRepositoryApi {
  getAPI(version: 1): { getRepository(uri: vscode.Uri): { readonly rootUri: vscode.Uri } | null }
}

/** The repository that the git extension opened in `dir`, or undefined. */
export const gitRepository = (dir: string): { readonly rootUri: vscode.Uri } | undefined =>
  vscode.extensions
    .getExtension<GitRepositoryApi>('vscode.git')
    ?.exports.getAPI(1)
    .getRepository(vscode.Uri.file(dir)) ?? undefined

/** The git extension holds the files of a repository that it opened, so it closes the repository first. */
export const removeRepository = async (dir: string): Promise<void> => {
  const repository = gitRepository(dir)
  if (repository !== undefined)
    await vscode.commands.executeCommand('git.close', repository.rootUri)
  await rm(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
}
