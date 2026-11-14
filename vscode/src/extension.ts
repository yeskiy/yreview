import { homedir } from 'node:os'

import * as vscode from 'vscode'

import { ReviewComments } from './comments/controller'
import { checkGit, findGitPath } from './git/gitPath'
import { offerIntellijKey } from './keyOffer'
import { redactingLog } from './log'
import { withLongForms } from './places'
import { offerSaveKey } from './saveKey'
import { ReviewService } from './store/reviewService'
import { vscodeHost } from './vscodeHost'

export interface YreviewApi {
  /** Undefined when git is missing or older than 2.24, so the comment features stay off. */
  readonly comments: ReviewComments | undefined
  readonly service: ReviewService | undefined
}

const COMMENT_COMMANDS = [
  'yreview.addComment',
  'yreview.saveLocal',
  'yreview.saveShared',
  'yreview.resolve',
  'yreview.delete',
]

const projectFolders = (): readonly string[] =>
  withLongForms((vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath))

export const activate = async (context: vscode.ExtensionContext): Promise<YreviewApi> => {
  const output = vscode.window.createOutputChannel('Yreview', { log: true })
  const held: { service?: ReviewService; projects: readonly string[] } = {
    projects: projectFolders(),
  }
  const homes = withLongForms(
    [process.env.USERPROFILE ?? '', homedir()].filter((home) => home !== ''),
  )
  const log = redactingLog(output, () => ({
    homes,
    projects: held.projects,
    repositories: held.service?.knownRoots() ?? [],
  }))
  context.subscriptions.push(
    output,
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      held.projects = projectFolders()
    }),
    vscode.commands.registerCommand('yreview.showLog', () => output.show(true)),
  )
  const git = await findGitPath()
  const problem = await checkGit(git)
  if (problem !== undefined) {
    log.error(problem)
    context.subscriptions.push(
      ...COMMENT_COMMANDS.map((command) =>
        vscode.commands.registerCommand(command, () => vscode.window.showErrorMessage(problem)),
      ),
    )
    vscode.window.showErrorMessage(problem)
    return { comments: undefined, service: undefined }
  }
  held.service = new ReviewService(vscodeHost(context.workspaceState, git))
  const comments = new ReviewComments(held.service, log)
  context.subscriptions.push(comments)
  const settle = (): void => {
    held.service
      ?.folderStoreRoots(true)
      .catch((error: unknown) => log.error('The move of a folder store failed.', error))
  }
  settle()
  context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(settle))
  offerIntellijKey(context.globalState).catch((error: unknown) =>
    log.error('The key offer failed.', error),
  )
  offerSaveKey(context.globalState, log).catch((error: unknown) =>
    log.error('The save key offer failed.', error),
  )
  log.info('Yreview started.')
  return { comments, service: held.service }
}

export const deactivate = (): void => undefined
