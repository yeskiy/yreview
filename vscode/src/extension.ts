import { homedir } from 'node:os'

import type MarkdownIt from 'markdown-it'
import * as vscode from 'vscode'

import { homeDirectory } from './bridge/discoveryFile'
import { ReviewComments } from './comments/controller'
import { registerDiagnostics } from './diagnostic/host'
import { SessionLog } from './diagnostic/sessionLog'
import { gitMissingNotice } from './git/gitMissing'
import { checkGit, findGitPath } from './git/gitPath'
import { type HandoffApi, registerHandoff } from './handoff/register'
import { offerIntellijKey } from './keyOffer'
import type { BridgeHost } from './bridge/host'
import { type Places, redactingLog } from './log'
import { withLongForms } from './places'
import { previewPlugin } from './preview/markdownPlugin'
import { PreviewHost } from './preview/previewHost'
import { ReviewPreviews } from './reviewPreview/reviewPreviews'
import { registerSaveKey } from './saveKey'
import { registerSessions } from './session/register'
import { registerSettingsPage } from './settingsPage'
import type { ReviewSessions } from './session/terminals'
import { shareLogOf } from './shareLogState'
import { ReviewService } from './store/reviewService'
import { projectCompletionHost } from './tasks/completionHost'
import { TaskCompletion } from './tasks/taskCompletion'
import { type TaskViews, createTaskViews, placeholderViews } from './views/taskViews'
import { registerViewCommands } from './views/viewCommands'
import { type TaskWrites, createTaskWrites, registerTaskWrites } from './views/taskWrites'
import { vscodeHost } from './vscodeHost'
import { type BridgeWiring, wireBridge } from './wiring/bridge'
import { registerChatTools } from './wiring/chat'
import { registerDelivery } from './wiring/send'
import { sessionLink } from './wiring/sessions'

export interface YreviewApi {
  /** Undefined when git is missing or older than 2.24, so the comment features stay off. */
  readonly comments: ReviewComments | undefined
  readonly service: ReviewService | undefined
  readonly tasks: TaskViews | undefined
  readonly completion: TaskCompletion | undefined
  readonly writes: TaskWrites | undefined
  readonly sessions: ReviewSessions
  readonly handoff: HandoffApi | undefined
  /** Undefined when git is missing, so a session starts without the channel. */
  readonly bridge: BridgeHost | undefined
  /** Undefined when git is missing. Tests call its link handler. */
  readonly preview: PreviewHost | undefined
  /** Undefined when git is missing. */
  readonly reviewPreviews: ReviewPreviews | undefined
  /** The Markdown preview calls it, because the manifest sets markdown.markdownItPlugins. */
  extendMarkdownIt(md: MarkdownIt): MarkdownIt
}

const COMMENT_COMMANDS = [
  'yreview.addComment',
  'yreview.saveLocal',
  'yreview.saveShared',
  'yreview.resolve',
  'yreview.delete',
]

/** The bridge of the window, so deactivate can delete its discovery file. */
const active: { bridge?: BridgeWiring } = {}

const projectFolders = (): readonly string[] =>
  withLongForms((vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath))

export const activate = async (context: vscode.ExtensionContext): Promise<YreviewApi> => {
  const output = vscode.window.createOutputChannel('Yreview', { log: true })
  const held: {
    service?: ReviewService
    tasks?: TaskViews
    projects: readonly string[]
  } = {
    projects: projectFolders(),
  }
  const homes = withLongForms(
    [...new Set([homeDirectory(), homedir()])].filter((home) => home !== ''),
  )
  const places = (): Places => ({
    homes,
    projects: held.projects,
    repositories: [...(held.service?.knownRoots() ?? []), ...(held.tasks?.model.roots() ?? [])],
  })
  const ring = new SessionLog()
  const log = redactingLog(output, places, { ring, ownRoot: context.extensionPath })
  context.subscriptions.push(
    output,
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      held.projects = projectFolders()
    }),
    vscode.commands.registerCommand('yreview.showLog', () => output.show(true)),
  )
  const link = sessionLink(log)
  const sessions = registerSessions(context, log, link.prepare)
  context.subscriptions.push(registerSettingsPage())
  const git = await findGitPath()
  context.subscriptions.push(...registerDiagnostics(context, { log, ring, places, git }))
  const problem = await checkGit(git)
  if (problem !== undefined) {
    log.error(problem)
    context.subscriptions.push(
      ...COMMENT_COMMANDS.map((command) =>
        vscode.commands.registerCommand(command, () => vscode.window.showErrorMessage(problem)),
      ),
      ...placeholderViews(problem),
    )
    gitMissingNotice(
      problem,
      (message, button) => vscode.window.showErrorMessage(message, button),
      () => vscode.commands.executeCommand('workbench.action.openSettings', 'git.path'),
    ).catch((error: unknown) => log.error('The git notice failed.', error))
    return {
      comments: undefined,
      service: undefined,
      tasks: undefined,
      completion: undefined,
      writes: undefined,
      sessions,
      handoff: undefined,
      bridge: undefined,
      preview: undefined,
      reviewPreviews: undefined,
      extendMarkdownIt: (md: MarkdownIt) => md,
    }
  }
  held.service = new ReviewService(
    vscodeHost(context.workspaceState, git),
    shareLogOf(context.workspaceState),
  )
  const comments = new ReviewComments(held.service, log)
  const preview = new PreviewHost(held.service, log, comments.onDidAskRanges)
  const reviewPreviews = new ReviewPreviews(context.extensionUri, log)
  context.subscriptions.push(comments, preview, reviewPreviews)
  held.tasks = createTaskViews(held.service, comments, git, log, context.workspaceState)
  context.subscriptions.push(held.tasks)
  context.subscriptions.push(...registerViewCommands(held.tasks, log))
  const { tasks } = held
  const completion = new TaskCompletion(
    projectCompletionHost(
      held.service,
      git,
      () => tasks.model.readyRoots(),
      () => tasks.openTodos(),
    ),
  )
  const writes = createTaskWrites(tasks, held.service, completion)
  context.subscriptions.push(...registerTaskWrites(writes, log))
  const handoff = registerHandoff(context, {
    service: held.service,
    gitPath: git,
    log,
    gitRoots: () => tasks.model.readyRoots(),
    openTodos: () => tasks.openTodos(),
    chosenTasks: () => tasks.chosenTasks(),
  })
  const bridge = wireBridge(context, held.service, (ids) => handoff.close(ids), git, log)
  active.bridge = bridge
  link.attach(bridge, sessions)
  registerDelivery(context, {
    wiring: bridge,
    registry: sessions.registry,
    handoff,
    chosenTasks: () => tasks.chosenTasks(),
    gitPath: git,
    log,
  })
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
  context.subscriptions.push(...registerSaveKey(context, log, (text) => comments.placeholder(text)))
  registerChatTools(context, bridge, log)
  log.info('Yreview started.')
  return {
    comments,
    service: held.service,
    tasks,
    completion,
    writes,
    sessions,
    handoff,
    bridge: bridge.host,
    preview,
    reviewPreviews,
    extendMarkdownIt: previewPlugin(preview.source),
  }
}

export const deactivate = async (): Promise<void> => active.bridge?.host.dispose()
