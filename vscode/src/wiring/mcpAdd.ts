import { execFile } from 'node:child_process'
import { homedir } from 'node:os'
import path from 'node:path'

import * as vscode from 'vscode'

import { homeDirectory } from '../bridge/discoveryFile'
import { redactText } from '../core/redact'
import type { Log } from '../log'
import { commandOf } from '../session/agentCommands'
import { addCommand, appendedText, programFor, userFileText } from '../session/agentMcp'
import { AgentScan, installOf } from '../session/agentScan'
import { readAgentSettings } from '../session/agentSettings'
import { agentOf } from '../session/catalog'
import { type ServerLaunch, configText, launcherLaunch } from '../session/channelConfig'
import { launcherPath } from '../session/launcher'
import { writeMcpFile } from '../session/mcpFile'
import { powerShellQuote } from '../session/shellCommand'
import type { BridgeWiring } from './bridge'

export const ADD = 'Add'
export const CURSOR_FILE = path.join('.cursor', 'mcp.json')
export const CURSOR_DONE = 'Yreview added the review server to .cursor/mcp.json.'
export const AGY_DONE = 'Antigravity now lists the review server.'
export const COPY_DONE =
  'Yreview copied the MCP entry. Paste it into the MCP file of your editor or agent.'
const RUN_MS = 30_000
const ERROR_CHARS = 500

/** The text of a failure for a message box, with no home folder and no project path. */
export const shownText = (text: string): string =>
  redactText(
    text,
    [...new Set([homeDirectory(), homedir()])],
    (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath),
    [],
  )

interface Exit {
  readonly code: number | string | undefined
  readonly stderr: string
}

/** The launcher path of a stored route. Yreview writes the launcher only after the user agrees. */
const storedLaunch = (): ServerLaunch => launcherLaunch(launcherPath(homeDirectory()))

const asked = async (message: string, detail: string): Promise<boolean> =>
  (await vscode.window.showWarningMessage(message, { modal: true, detail }, ADD)) === ADD

const folderOf = async (): Promise<vscode.WorkspaceFolder | undefined> => {
  const folders = (vscode.workspace.workspaceFolders ?? []).filter(
    (folder) => folder.uri.scheme === 'file',
  )
  return folders.length > 1
    ? vscode.window.showWorkspaceFolderPick({ placeHolder: 'Add the review server to' })
    : folders[0]
}

const addToCursor = async (wiring: BridgeWiring): Promise<void> => {
  const folder = await folderOf()
  const text = userFileText(agentOf('cursor'), storedLaunch())
  if (folder === undefined || text === undefined) return
  const outcome = await writeMcpFile(
    path.join(folder.uri.fsPath, CURSOR_FILE),
    text,
    async (_file, merged) => {
      const agreed = await asked(
        `Yreview writes this text into .cursor/mcp.json of ${folder.name}. Every other server and key of the file stays.`,
        merged,
      )
      if (agreed) await wiring.launcher()
      return agreed
    },
  )
  if (outcome.kind === 'problem') vscode.window.showErrorMessage(outcome.value)
  else if (outcome.kind === 'written') vscode.window.showInformationMessage(CURSOR_DONE)
}

const run = (program: string, args: readonly string[]): Promise<Exit> =>
  new Promise((resolve) => {
    execFile(
      program,
      args,
      { shell: false, timeout: RUN_MS, windowsHide: true },
      (error, _stdout, stderr) => resolve({ code: error?.code ?? (error ? 1 : 0), stderr }),
    )
  })

/** Node.js starts no .cmd or .bat file without a shell, so PowerShell runs it with quoted words. */
const runArgv = (argv: readonly string[]): Promise<Exit> =>
  process.platform === 'win32' && /\.(cmd|bat)$/i.test(argv[0] ?? '')
    ? run('powershell.exe', [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `& ${argv.map(powerShellQuote).join(' ')}`,
      ])
    : run(argv[0] ?? '', argv.slice(1))

const addToAntigravity = async (wiring: BridgeWiring): Promise<void> => {
  const agent = agentOf('antigravity')
  const program = programFor(
    agent,
    commandOf('antigravity', readAgentSettings().commands),
    installOf(await new AgentScan().refresh(), 'antigravity').path,
  )
  const argv = addCommand(agent, storedLaunch(), program)
  if (argv === undefined) return
  if (
    !(await asked(
      'Yreview runs this command once, so Antigravity lists the review server.',
      appendedText(agent, program, storedLaunch()),
    ))
  ) {
    return
  }
  await wiring.launcher()
  const exit = await runArgv(argv)
  if (exit.code === 0) vscode.window.showInformationMessage(AGY_DONE)
  else {
    vscode.window.showErrorMessage(
      `The command ended with code ${String(exit.code)}. ${shownText(exit.stderr).slice(0, ERROR_CHARS)}`,
    )
  }
}

const copyEntry = async (wiring: BridgeWiring): Promise<void> => {
  await vscode.env.clipboard.writeText(
    configText('cursor', launcherLaunch(await wiring.launcher())),
  )
  vscode.window.showInformationMessage(COPY_DONE)
}

const guarded = (log: Log, name: string, work: () => Promise<void>) => (): Promise<void> =>
  work().catch((error: unknown) => {
    log.error(`The command ${name} failed.`, error)
    vscode.window.showErrorMessage(`The command ${name} failed. ${shownText(String(error))}`)
  })

const COMMANDS: readonly (readonly [string, (wiring: BridgeWiring) => Promise<void>])[] = [
  ['yreview.addMcpCursor', addToCursor],
  ['yreview.addMcpAntigravity', addToAntigravity],
  ['yreview.copyMcpEntry', copyEntry],
]

export const registerMcpAdd = (wiring: BridgeWiring, log: Log): readonly vscode.Disposable[] =>
  COMMANDS.map(([name, work]) =>
    vscode.commands.registerCommand(
      name,
      guarded(log, name, () => work(wiring)),
    ),
  )
