import { homedir } from 'node:os'

import * as vscode from 'vscode'

import { gitProblem } from './gitVersion'
import { ProcessGitRunner } from './runner'

interface GitApi {
  readonly git: { readonly path: string }
}

interface GitExtension {
  getAPI(version: 1): GitApi
}

/** The user value of git.path only, so that a workspace cannot choose the program. */
const userGitPath = (): string | undefined => {
  const value = vscode.workspace.getConfiguration('git').inspect<unknown>('path')?.globalValue
  const first = Array.isArray(value) ? (value as unknown[])[0] : value
  return typeof first === 'string' && first.trim() !== '' ? first.trim() : undefined
}

/** The git that the built-in git extension found, else the user setting git.path, else git on the PATH. */
export const findGitPath = async (): Promise<string> => {
  const extension = vscode.extensions.getExtension<GitExtension>('vscode.git')
  const exports = await Promise.resolve(extension?.activate()).catch(() => undefined)
  const found = ((): string | undefined => {
    try {
      return exports?.getAPI(1).git.path
    } catch {
      // The git extension throws when the user turned it off with git.enabled.
      return undefined
    }
  })()
  return found ?? userGitPath() ?? 'git'
}

/** Undefined when the git at this path is 2.24 or later, else the message for the user. */
export const checkGit = async (path: string): Promise<string | undefined> =>
  gitProblem(await new ProcessGitRunner(homedir(), path).run(['--version']))
