import { homedir } from 'node:os'

import * as vscode from 'vscode'

import { ReviewComments } from './comments/controller'
import { checkGit, findGitPath } from './git/gitPath'
import { offerIntellijKey } from './keyOffer'
import { redactingLog } from './log'
import { ReviewService } from './store/reviewService'
import { vscodeHost } from './store/vscodeHost'

export interface YreviewApi {
  /** Undefined when git is missing or older than 2.24, so the comment features stay off. */
  readonly comments: ReviewComments | undefined
}

const COMMENT_COMMANDS = [
  'yreview.addComment',
  'yreview.saveLocal',
  'yreview.saveShared',
  'yreview.resolve',
  'yreview.delete',
]

export const activate = async (context: vscode.ExtensionContext): Promise<YreviewApi> => {
  const output = vscode.window.createOutputChannel('Yreview', { log: true })
  const held: { service?: ReviewService } = {}
  const log = redactingLog(output, () => ({
    homes: [process.env.USERPROFILE ?? '', homedir()].filter((home) => home !== ''),
    projects: (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath),
    repositories: held.service?.knownRoots() ?? [],
  }))
  context.subscriptions.push(
    output,
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
    return { comments: undefined }
  }
  held.service = new ReviewService(vscodeHost(context.workspaceState, git))
  const comments = new ReviewComments(held.service, log)
  context.subscriptions.push(comments)
  offerIntellijKey(context.globalState).catch((error: unknown) =>
    log.error('The key offer failed.', error),
  )
  log.info('Yreview started.')
  return { comments }
}

export const deactivate = (): void => undefined
