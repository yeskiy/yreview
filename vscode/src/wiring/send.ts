import * as vscode from 'vscode'

import type { BatchTask } from '../bridge/batchBuilder'
import { pushPrompt } from '../bridge/openCodeClient'
import { pushFallback } from '../bridge/pushFallback'
import { type SessionChoice, sendPickOf } from '../bridge/sendPicks'
import { type SendReport, sendNotice, sendRouteOf } from '../bridge/sendReport'
import { handleOf } from '../core/handles'
import { sendOf } from '../diagnostic/records'
import { sendRecord } from '../diagnostic/sessionRecord'
import { ProcessGitRunner, isOk } from '../git/runner'
import { handoffPrompt } from '../handoff/handoffPrompt'
import type { HandoffStore } from '../handoff/handoffWriter'
import { type HandoffApi, isTaskList } from '../handoff/register'
import type { Log } from '../log'
import { sendReason } from '../session/agentRows'
import { readAgentSettings } from '../session/agentSettings'
import { type AgentSpec, DEFAULT_AGENT, agentOf } from '../session/catalog'
import { takesSend } from '../session/sessionReach'
import type { SessionRegistry } from '../session/sessionRegistry'
import { readSettings } from '../settings'
import type { ReviewTask } from '../tasks/reviewTask'
import { OUTSIDE_TASKS, agentTasks } from '../tasks/taskChoice'
import type { BridgeWiring } from './bridge'
import { registerMcpAdd, shownText } from './mcpAdd'

export const NO_TASK = 'Check or select the review tasks to send first.'
export const PICK_PLACEHOLDER = 'Send the review tasks to'
export const SEND_FAILED = 'The send of the review tasks failed.'

export interface DeliveryInput {
  readonly gitRepository: boolean
  readonly branch: string
  readonly commit: string | undefined
  /** The outward tasks, each with its short handle. */
  readonly tasks: readonly BatchTask[]
  readonly prompt: string
  readonly folder: string
  readonly agent: AgentSpec
}

export interface DeliveryDeps {
  readonly wiring: BridgeWiring
  readonly registry: SessionRegistry
  readonly handoff: HandoffApi
  readonly chosenTasks: () => readonly ReviewTask[]
  readonly gitPath: string
  readonly log: Log
}

export interface Delivery {
  readonly report: SendReport
  readonly clipboard?: string
}

/** The sessions that take a send now, in tab order. A channel session needs an open stream. */
export const choices = (deps: DeliveryDeps): readonly SessionChoice[] => {
  const open = deps.wiring.host.openKeys()
  return deps.registry
    .entries()
    .filter((entry) => takesSend(entry.reach, open.includes(entry.key)))
    .map((entry) => ({ key: entry.key, name: entry.name }))
}

const chosenOf = async (
  named: readonly SessionChoice[],
  channel: boolean,
): Promise<SessionChoice | undefined> => {
  const pick = sendPickOf(named, channel)
  if (pick.kind === 'one') return pick.choice
  if (pick.kind === 'none') return undefined
  const answer = await vscode.window.showQuickPick(
    pick.choices.map((choice) => ({ label: choice.name, choice })),
    { placeHolder: PICK_PLACEHOLDER },
  )
  return answer?.choice
}

/** Undefined when the user closed the session pick, so the send stops there. */
export const deliver = async (
  deps: DeliveryDeps,
  input: DeliveryInput,
): Promise<Delivery | undefined> => {
  const named = choices(deps)
  const route = sendRouteOf(readSettings().channel, named.length, input.gitRepository)
  if (route !== 'channel') {
    return {
      report: {
        tasks: input.tasks.length,
        batches: 0,
        streams: 0,
        route,
        folder: input.folder,
        agentReason: sendReason(input.agent),
      },
      clipboard: input.prompt,
    }
  }
  const chosen = await chosenOf(named, true)
  if (chosen === undefined) return undefined
  const reach = chosen.key === undefined ? undefined : deps.registry.reachOf(chosen.key)
  if (reach?.kind === 'localHttp') {
    const problem = await pushPrompt(reach.port, reach.password, input.prompt)
    if (problem !== undefined) deps.log.warn(`The OpenCode push failed. ${problem}`)
    const reached = problem === undefined
    return pushFallback(
      {
        tasks: reached ? input.tasks.length : 0,
        batches: 0,
        streams: reached ? 1 : 0,
        problem,
        targetName: chosen.name,
      },
      input.prompt,
    )
  }
  return {
    report: await deps.wiring.host.sendTasks(
      input.branch,
      input.commit,
      input.tasks,
      chosen.key,
      chosen.name,
    ),
  }
}

const toBatchTask = (task: ReviewTask): BatchTask => ({
  id: task.id,
  path: task.path,
  startLine: task.startLine,
  startColumn: task.startColumn,
  endLine: task.endLine,
  endColumn: task.endColumn,
  revision: task.revision,
  text: task.text,
})

const branchOf = async (deps: DeliveryDeps, store: HandoffStore): Promise<string> => {
  if (store.kind !== 'git') return ''
  const result = await new ProcessGitRunner(store.root, deps.gitPath)
    .run(['rev-parse', '--abbrev-ref', 'HEAD'])
    .catch(() => undefined)
  return result !== undefined && isOk(result) ? result.stdout.trim() : ''
}

const show = (report: SendReport): void => {
  const notice = sendNotice(report)
  if (notice.warning) vscode.window.showWarningMessage(notice.text)
  else vscode.window.showInformationMessage(notice.text)
}

/** Writes and sends the tasks of one store. Undefined when nothing went out. */
const sendStore = async (
  deps: DeliveryDeps,
  store: HandoffStore,
  group: readonly ReviewTask[],
  agent: AgentSpec,
): Promise<Delivery | undefined> => {
  const written = await deps.handoff.write(store, group)
  if (written === undefined) {
    vscode.window.showWarningMessage(
      `Yreview wrote no task file for ${store.root}, so it sent nothing from that folder.`,
    )
    return undefined
  }
  const git = store.kind === 'git'
  const result = await deliver(deps, {
    gitRepository: git,
    branch: await branchOf(deps, store),
    commit: git && written.commit !== '' ? written.commit : undefined,
    tasks: group.map(toBatchTask),
    prompt: handoffPrompt(written.label, written.commit, group),
    folder: written.label,
    agent,
  })
  if (result === undefined) return undefined
  show(result.report)
  deps.log.record(sendRecord(sendOf(result.report, git ? 'git' : 'folder', choices(deps).length)))
  return result
}

/** The stores run one after the other, so two session picks never show at the same time. */
const sendAll = async (
  deps: DeliveryDeps,
  stores: readonly HandoffStore[],
  tasks: readonly ReviewTask[],
  agent: AgentSpec,
): Promise<readonly string[]> =>
  stores.reduce<Promise<readonly string[]>>(async (earlier, store) => {
    const copied = await earlier
    const group = tasks.filter((task) => task.rootPath === store.root)
    if (group.length === 0) return copied
    const result = await sendStore(deps, store, group, agent)
    return result?.clipboard === undefined ? copied : [...copied, result.clipboard]
  }, Promise.resolve([]))

export const sendTasks = async (deps: DeliveryDeps, given?: unknown): Promise<void> => {
  const chosen = isTaskList(given) ? given : deps.chosenTasks()
  const tasks = agentTasks(chosen)
  if (tasks.length === 0) {
    vscode.window.showWarningMessage(chosen.length === 0 ? NO_TASK : OUTSIDE_TASKS)
    return
  }
  // An agent reads only the short handle, as in the copy of the tasks.
  const outward = tasks.map((task) => ({ ...task, id: handleOf(task.id) }))
  const copied = await sendAll(
    deps,
    await deps.handoff.stores(),
    outward,
    agentOf(readAgentSettings().agent ?? DEFAULT_AGENT),
  )
  if (copied.length > 0) await vscode.env.clipboard.writeText(copied.join('\n\n'))
}

export const registerDelivery = (context: vscode.ExtensionContext, deps: DeliveryDeps): void => {
  context.subscriptions.push(
    vscode.commands.registerCommand('yreview.sendTasks', (given?: unknown) =>
      sendTasks(deps, given).catch((error: unknown) => {
        deps.log.error(SEND_FAILED, error)
        vscode.window.showErrorMessage(`${SEND_FAILED} ${shownText(String(error))}`)
      }),
    ),
    ...registerMcpAdd(deps.wiring, deps.log),
  )
}
