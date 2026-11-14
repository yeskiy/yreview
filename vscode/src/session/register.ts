import * as vscode from 'vscode'

import type { Log } from '../log'
import { commandOf, withCommand } from './agentCommands'
import { CHOOSE, NOTHING_FOUND, NO_AGENT, SEARCHING, UNKNOWN_CHOICE, place, row } from './agentRows'
import { AgentScan, anyFound, installOf } from './agentScan'
import { readAgentSettings, saveAgent, saveCommands } from './agentSettings'
import { AGENTS, type AgentId, DEFAULT_AGENT, agentOf, isProduct, orderedAgents } from './catalog'
import { NO_EXTRAS, type SessionPreparer } from './sessionPlan'
import { apart } from './sessionRules'
import { SessionsView } from './sessionsView'
import { type ReviewSession, ReviewSessions, nameOf } from './terminals'

const NO_SESSION = 'No review session runs.'

const isSession = (value: unknown): value is ReviewSession =>
  typeof value === 'object' && value !== null && typeof (value as ReviewSession).key === 'string'

/** The session of the tree row, else of the active terminal, else the one the user picks. */
const pickSession = async (
  sessions: ReviewSessions,
  given: unknown,
): Promise<ReviewSession | undefined> => {
  const listed = sessions.list()
  const chosen =
    (isSession(given) ? sessions.byKey(given.key) : undefined) ??
    listed.find((session) => session.terminal === vscode.window.activeTerminal) ??
    (listed.length === 1 ? listed[0] : undefined)
  if (chosen !== undefined) return chosen
  if (listed.length === 0) {
    vscode.window.showInformationMessage(NO_SESSION)
    return undefined
  }
  const names = apart(listed.map(nameOf))
  const picked = await vscode.window.showQuickPick(
    listed.map((session, index) => ({ label: names[index] ?? nameOf(session), session })),
    { title: 'Choose a review session' },
  )
  return picked?.session
}

export const registerSessions = (
  context: vscode.ExtensionContext,
  log: Log,
  preparer: SessionPreparer = NO_EXTRAS,
): ReviewSessions => {
  const scan = new AgentScan()
  const sessions = new ReviewSessions(log, preparer)
  const view = new SessionsView(sessions)
  const tree = vscode.window.createTreeView('yreview.sessions', { treeDataProvider: view })
  const state = { autoStarted: false }

  const showChoice = (): Thenable<unknown> =>
    vscode.commands.executeCommand(
      'setContext',
      'yreview.agentChosen',
      readAgentSettings().agent !== undefined,
    )

  const setAgentCommand = async (given?: AgentId): Promise<void> => {
    const id = given ?? readAgentSettings().agent ?? DEFAULT_AGENT
    const spec = agentOf(id)
    if (!isProduct(spec) && id !== 'custom') {
      vscode.window.showInformationMessage(NO_AGENT)
      return
    }
    const value = await vscode.window.showInputBox({
      title: `Command of ${spec.label}`,
      prompt: place(spec, scan.latest()),
      value: commandOf(id, readAgentSettings().commands),
      ignoreFocusOut: true,
    })
    if (value !== undefined)
      await saveCommands(withCommand(readAgentSettings().commands, id, value))
  }

  const chooseAgent = async (): Promise<void> => {
    const answer = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Window, title: SEARCHING },
      () => scan.refresh(),
    )
    const settings = readAgentSettings()
    const found = new Set(
      AGENTS.filter((spec) => installOf(answer, spec.id).path !== undefined).map((spec) => spec.id),
    )
    const picked = await vscode.window.showQuickPick(
      orderedAgents(found).map((spec) => ({
        label: spec.label,
        description: installOf(answer, spec.id).path,
        detail: row(spec, found.has(spec.id)),
        picked: spec.id === settings.agent,
        id: spec.id,
      })),
      {
        title:
          settings.agent === undefined && settings.storedAgent !== '' ? UNKNOWN_CHOICE : CHOOSE,
        placeHolder: anyFound(answer) ? undefined : NOTHING_FOUND,
        matchOnDetail: true,
      },
    )
    if (picked === undefined) return
    await saveAgent(picked.id)
    if (picked.id === 'custom') {
      await setAgentCommand('custom')
      return
    }
    await sessions.start(agentOf(picked.id))
  }

  const startSession = async (): Promise<void> => {
    const { agent } = readAgentSettings()
    if (agent === undefined) {
      await chooseAgent()
      return
    }
    await sessions.start(agentOf(agent))
  }

  /** The first view of the panel starts one session, as the IntelliJ session window does. */
  const autoStart = (): void => {
    const settings = readAgentSettings()
    if (state.autoStarted || !tree.visible || !settings.autoStart) return
    if (settings.agent === undefined || sessions.list().length > 0) return
    state.autoStarted = true
    sessions
      .start(agentOf(settings.agent), true)
      .catch((error: unknown) => log.error('The review session did not start.', error))
  }

  const run =
    (action: (given?: unknown) => Promise<unknown>) =>
    (given?: unknown): Promise<void> =>
      action(given).then(
        () => undefined,
        (error: unknown) => {
          log.error('The session command failed.', error)
          vscode.window.showErrorMessage(`The session command failed. ${String(error)}`)
        },
      )

  context.subscriptions.push(
    sessions,
    view,
    tree,
    tree.onDidChangeVisibility(autoStart),
    vscode.commands.registerCommand('yreview.startSession', run(startSession)),
    vscode.commands.registerCommand('yreview.chooseAgent', run(chooseAgent)),
    vscode.commands.registerCommand(
      'yreview.setAgentCommand',
      run(() => setAgentCommand()),
    ),
    vscode.commands.registerCommand(
      'yreview.stopSession',
      run(async (given) => {
        const session = await pickSession(sessions, given)
        if (session !== undefined) sessions.stop(session)
      }),
    ),
    vscode.commands.registerCommand(
      'yreview.renameSession',
      run(async (given) => {
        const session = await pickSession(sessions, given)
        if (session !== undefined) await sessions.rename(session)
      }),
    ),
    vscode.commands.registerCommand(
      'yreview.showSession',
      run(async (given) => (await pickSession(sessions, given))?.terminal.show(false)),
    ),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('yreview.agent')) showChoice()
    }),
  )
  showChoice()
  scan.refresh().catch((error: unknown) => log.error('The agent search failed.', error))
  autoStart()
  return sessions
}
