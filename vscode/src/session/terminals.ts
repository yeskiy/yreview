import * as vscode from 'vscode'

import { isKotlinBlank } from '../core/kotlinText'
import { startOf } from '../diagnostic/records'
import { commandKind } from '../diagnostic/report'
import { sessionRecord } from '../diagnostic/sessionRecord'
import type { Log } from '../log'
import { commandOf } from './agentCommands'
import { isFile } from './commandWords'
import { NO_AGENT } from './agentRows'
import { readAgentSettings } from './agentSettings'
import type { AgentSpec } from './catalog'
import { newSessionKey } from './sessionKey'
import { HINT, PROMPT, TITLE, cleanName } from './sessionNaming'
import { NO_COMMAND, type SessionPreparer, planSession } from './sessionPlan'
import { SessionRegistry } from './sessionRegistry'
import { MAX_SESSIONS, canOpen, endWarning, freeNumber, sessionName } from './sessionRules'

export const SWEEP_MS = 3_000
const ACTIVE_WAIT_MS = 2_000
const STATUS_MS = 15_000
const SET_COMMAND = 'Set Agent Command'

export const FULL = `Yreview runs ${MAX_SESSIONS} review sessions at once. Stop one session first.`
export const NO_FOLDER = 'Open a folder first. A review session runs in the folder of this window.'

export interface ReviewSession {
  readonly key: string
  readonly number: number
  readonly agent: AgentSpec
  readonly terminal: vscode.Terminal
  readonly startedAt: number
  readonly byUser?: string | undefined
  readonly byAgent?: string | undefined
  readonly release?: (() => void) | undefined
}

export const nameOf = (session: ReviewSession): string =>
  sessionName({
    number: session.number,
    agent: session.agent.short,
    byAgent: session.byAgent,
    byUser: session.byUser,
  })

/** VS Code shows no title that an agent writes, so a name of the user never fights it. */
const renamePrompt = (agent: AgentSpec): string =>
  agent.naming.kind === 'agent'
    ? `${HINT} ${agent.label} also names its sessions with ${agent.naming.command}, and this editor does not show that name.`
    : HINT

/** True when the terminal became the active one within the wait. */
const becomesActive = (terminal: vscode.Terminal): Promise<boolean> =>
  vscode.window.activeTerminal === terminal
    ? Promise.resolve(true)
    : new Promise((resolve) => {
        const held: { timer?: NodeJS.Timeout; listener?: vscode.Disposable } = {}
        const finish = (active: boolean): void => {
          clearTimeout(held.timer)
          held.listener?.dispose()
          resolve(active)
        }
        held.listener = vscode.window.onDidChangeActiveTerminal((active) => {
          if (active === terminal) finish(true)
        })
        held.timer = setTimeout(() => finish(false), ACTIVE_WAIT_MS)
      })

/** Offers Set Agent Command beside the message. */
const askCommand = (message: string): void => {
  vscode.window
    .showWarningMessage(message, SET_COMMAND)
    .then((choice) =>
      choice === SET_COMMAND
        ? vscode.commands.executeCommand('yreview.setAgentCommand')
        : undefined,
    )
}

export class ReviewSessions implements vscode.Disposable {
  readonly registry = new SessionRegistry()

  private sessions: ReadonlyMap<string, ReviewSession> = new Map()

  private readonly changed = new vscode.EventEmitter<void>()

  readonly onDidChange = this.changed.event

  private sweeper: NodeJS.Timeout | undefined

  private readonly closing: vscode.Disposable

  constructor(
    private readonly log: Log,
    private readonly preparer: SessionPreparer,
  ) {
    this.closing = vscode.window.onDidCloseTerminal((terminal) =>
      [...this.sessions.values()]
        .filter((session) => session.terminal === terminal)
        .forEach((session) => this.end(session)),
    )
  }

  list(): readonly ReviewSession[] {
    return [...this.sessions.values()].sort((one, two) => one.number - two.number)
  }

  byKey(key: string): ReviewSession | undefined {
    return this.sessions.get(key)
  }

  /** Starts one session of this agent. No agent starts nothing and says so. */
  async start(agent: AgentSpec, preserveFocus = false): Promise<ReviewSession | undefined> {
    if (agent.id === 'none') {
      vscode.window.showInformationMessage(NO_AGENT)
      return undefined
    }
    const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    if (folder === undefined) {
      vscode.window.showErrorMessage(NO_FOLDER)
      return undefined
    }
    const { commands } = readAgentSettings()
    const command = commandOf(agent.id, commands)
    if (isKotlinBlank(command)) {
      askCommand(NO_COMMAND)
      return undefined
    }
    if (!canOpen(this.sessions.size)) {
      vscode.window.showWarningMessage(FULL)
      return undefined
    }
    const key = newSessionKey()
    const commandIsFile = await isFile(command)
    const extras = await this.preparer(agent, key)
    // A second start can finish during the wait, so the cap and the number are read again here.
    if (!canOpen(this.sessions.size)) {
      extras.release?.()
      vscode.window.showWarningMessage(FULL)
      return undefined
    }
    const number = freeNumber(new Set([...this.sessions.values()].map((open) => open.number)))
    const plan = planSession({
      projectPath: folder,
      agent,
      command,
      commandIsFile,
      extras,
    })
    const session: ReviewSession = {
      key,
      number,
      agent,
      startedAt: Date.now(),
      release: extras.release,
      terminal: vscode.window.createTerminal({
        name: sessionName({ number, agent: agent.short }),
        cwd: plan.workingDirectory,
        env: { ...plan.environment },
        shellPath: plan.shellPath,
        shellArgs: [...plan.shellArgs],
        iconPath: new vscode.ThemeIcon('comment-discussion'),
        location:
          readAgentSettings().location === 'editor'
            ? vscode.TerminalLocation.Editor
            : vscode.TerminalLocation.Panel,
        isTransient: true,
      }),
    }
    this.sessions = new Map(this.sessions).set(key, session)
    this.registry.add(key, nameOf(session), extras.reach)
    // The process id comes later, so the record waits for it and the start does not.
    Promise.resolve(session.terminal.processId)
      .then((processId) =>
        startOf(plan, extras, {
          agentCommand: commandKind(agent.id, commands),
          terminalStarted: true,
          processId,
        }),
      )
      .then(
        (start) => this.log.record(sessionRecord(start)),
        (error: unknown) => this.log.error('The record of the session start failed.', error),
      )
    session.terminal.show(preserveFocus)
    vscode.window.setStatusBarMessage(plan.status, STATUS_MS)
    this.log.info(`Review session ${number} started with ${agent.label}.`)
    this.sweeper ??= setInterval(() => this.sweep(), SWEEP_MS)
    this.changed.fire()
    return session
  }

  /** Ends the session and the process behind it. */
  stop(session: ReviewSession): void {
    this.end(session)
    session.terminal.dispose()
  }

  async rename(session: ReviewSession): Promise<void> {
    const answer = await vscode.window.showInputBox({
      title: TITLE,
      prompt: renamePrompt(session.agent),
      placeHolder: PROMPT,
      value: session.byUser ?? '',
    })
    if (answer === undefined) return
    await this.update(session.key, { byUser: cleanName(answer) }, true)
  }

  /** The name that the agent gave its session. It renames only a terminal that is active now. */
  nameFromAgent(key: string, name: string | undefined): void {
    if (this.sessions.get(key)?.byAgent === name) return
    this.update(key, { byAgent: name }, false).catch((error: unknown) =>
      this.log.error('The session name did not change.', error),
    )
  }

  dispose(): void {
    this.list().forEach((session) => this.stop(session))
    clearInterval(this.sweeper)
    this.closing.dispose()
    this.changed.dispose()
  }

  private async update(
    key: string,
    change: Pick<ReviewSession, 'byUser'> | Pick<ReviewSession, 'byAgent'>,
    focus: boolean,
  ): Promise<void> {
    const current = this.sessions.get(key)
    if (current === undefined) return
    const next: ReviewSession = { ...current, ...change }
    this.sessions = new Map(this.sessions).set(key, next)
    this.registry.rename(key, nameOf(next))
    this.changed.fire()
    if (focus) next.terminal.show(false)
    // VS Code renames only the active terminal.
    if (!(await becomesActive(next.terminal))) return
    await vscode.commands.executeCommand('workbench.action.terminal.renameWithArg', {
      name: nameOf(next),
    })
  }

  private sweep(): void {
    this.list()
      .filter((session) => session.terminal.exitStatus !== undefined)
      .forEach((session) => this.end(session))
  }

  /** Runs once for each session, whatever path reports the end first. */
  private end(session: ReviewSession): void {
    if (!this.sessions.has(session.key)) return
    this.sessions = new Map([...this.sessions].filter(([key]) => key !== session.key))
    this.registry.remove(session.key)
    session.release?.()
    if (this.sessions.size === 0) {
      clearInterval(this.sweeper)
      this.sweeper = undefined
    }
    const warning = endWarning(session.terminal.exitStatus?.code, Date.now() - session.startedAt)
    if (warning !== undefined) askCommand(warning)
    this.log.info(`Review session ${session.number} ended.`)
    this.changed.fire()
  }
}
