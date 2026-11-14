import * as vscode from 'vscode'

import { ProcessGitRunner } from '../git/runner'
import { gitRoot, projectPath, uniqueRoots } from '../tasks/roots'

export interface GitRepository {
  readonly rootUri: vscode.Uri
  readonly state: {
    readonly onDidChange: vscode.Event<void>
    readonly HEAD?: { readonly commit?: string }
  }
}

export interface GitApi {
  readonly repositories: readonly GitRepository[]
  readonly onDidOpenRepository: vscode.Event<GitRepository>
  readonly onDidCloseRepository: vscode.Event<GitRepository>
}

interface GitExtension {
  getAPI(version: 1): GitApi
}

/** The API of the built-in git extension, or undefined when it is off. */
export const gitApi = async (): Promise<GitApi | undefined> => {
  const exports = await Promise.resolve(
    vscode.extensions.getExtension<GitExtension>('vscode.git')?.activate(),
  ).catch(() => undefined)
  try {
    return exports?.getAPI(1)
  } catch {
    // The git extension throws when the user turned it off with git.enabled.
    return undefined
  }
}

/** The workspace folders on disk, each as the long real path with `/`. */
export const workspaceFolders = (): Promise<readonly string[]> =>
  Promise.all(
    (vscode.workspace.workspaceFolders ?? [])
      .filter((folder) => folder.uri.scheme === 'file')
      .map((folder) => projectPath(folder.uri.fsPath)),
  )

/** The roots that the git extension knows, and the root of each workspace folder. */
export const repositoryRoots = async (
  api: GitApi | undefined,
  gitPath: string,
  folders: readonly string[],
  signal?: AbortSignal,
): Promise<readonly string[]> =>
  uniqueRoots([
    ...(await Promise.all(
      (api?.repositories ?? []).map((repository) => projectPath(repository.rootUri.fsPath)),
    )),
    ...(await Promise.all(
      folders.map((folder) => gitRoot(new ProcessGitRunner(folder, gitPath), signal)),
    )),
  ])

/** Calls back when a repository changes its state, and when the git extension opens or closes one. */
export const watchRepositories = (
  api: GitApi | undefined,
  onChange: (repository: GitRepository) => void,
  onSet: () => void,
): vscode.Disposable => {
  const held: vscode.Disposable[] = []
  const follow = (repository: GitRepository): void => {
    held.push(repository.state.onDidChange(() => onChange(repository)))
  }
  api?.repositories.forEach(follow)
  if (api !== undefined) {
    held.push(
      api.onDidOpenRepository((repository) => {
        follow(repository)
        onSet()
      }),
      api.onDidCloseRepository(() => onSet()),
    )
  }
  return new vscode.Disposable(() => held.forEach((disposable) => disposable.dispose()))
}

/** Calls back when HEAD of a repository that the git extension knows moves to another commit. */
export const watchHeads = (api: GitApi | undefined, onMove: () => void): vscode.Disposable => {
  const heads = new Map<GitRepository, string | undefined>(
    (api?.repositories ?? []).map((repository) => [repository, repository.state.HEAD?.commit]),
  )
  return watchRepositories(
    api,
    (repository) => {
      const head = repository.state.HEAD?.commit
      if (head === undefined) return
      const before = heads.get(repository)
      heads.set(repository, head)
      if (before !== undefined && before !== head) onMove()
    },
    () => undefined,
  )
}
