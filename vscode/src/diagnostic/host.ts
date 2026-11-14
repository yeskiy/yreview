import { arch, homedir, release, type } from 'node:os'

import * as vscode from 'vscode'

import { redactFailure } from '../core/redact'
import { parseGitVersion } from '../git/gitVersion'
import { ProcessGitRunner } from '../git/runner'
import { guard } from '../guard'
import type { Log, Places } from '../log'
import { ISSUE_URL, failureStack, issueBody, issueLink, issueTitle } from './issueForm'
import { type MachineFacts, type ReportFacts, cleanWith, reportHead, reportText } from './report'
import type { SessionLog } from './sessionLog'
import { UNKNOWN } from './sessionRecord'

const COPIED =
  'The clipboard holds the Yreview diagnostic report. It carries versions, switches and states, and no comment text. Read it before you paste it into an issue.'
const PRIVACY =
  'This opens a new issue form in your browser. It fills in the error and the versions. Nothing goes anywhere until you read the form and press Submit. GitHub shows every issue in public.'
const OPEN_FORM = 'Open Form'
const LONG_FORM =
  'The report is too long for the address of the form. The clipboard holds the text. Paste it into the form.'

export interface DiagnosticsDeps {
  readonly log: Log
  readonly ring: SessionLog
  readonly places: () => Places
  readonly git: string
}

const gitVersion = async (git: string): Promise<string> =>
  parseGitVersion((await new ProcessGitRunner(homedir(), git).run(['--version'])).stdout)?.join(
    '.',
  ) ?? UNKNOWN

// A fork of VS Code can lack the language model API, so the check reads each function.
const lm = vscode.lm as Partial<typeof vscode.lm> | undefined

export const machineFacts = async (
  context: vscode.ExtensionContext,
  git: string,
): Promise<MachineFacts> => ({
  extension: String((context.extension.packageJSON as { version?: unknown }).version ?? UNKNOWN),
  editor: `${vscode.env.appName} ${vscode.version}`,
  host: vscode.env.remoteName ?? 'local',
  os: `${type()} ${release()} ${arch()}`,
  node: process.versions.node,
  git: await gitVersion(git),
  languageModelTools: typeof lm?.registerTool === 'function',
  mcpProvider: typeof lm?.registerMcpServerDefinitionProvider === 'function',
})

const reportFacts = (machine: MachineFacts): ReportFacts => {
  const config = vscode.workspace.getConfiguration('yreview')
  const agent = config.get<string>('agent') ?? ''
  const command = (config.get<Record<string, unknown>>('agentCommands') ?? {})[agent]
  return {
    machine,
    channel: config.get<boolean>('channel', true),
    sharing: config.get<string>('newComments', 'local'),
    sessionLocation: config.get<string>('sessionLocation', 'panel'),
    agent: agent === '' ? 'not chosen' : agent,
    agentCommand: typeof command === 'string' && command.trim() !== '' ? command : 'default',
  }
}

/** The copy command, the failure report, and the report head in the log at start. */
export const registerDiagnostics = (
  context: vscode.ExtensionContext,
  deps: DiagnosticsDeps,
): vscode.Disposable[] => {
  const facts = machineFacts(context, deps.git)
  facts
    .then((machine) => deps.log.info(reportHead(machine)))
    .catch((error: unknown) => deps.log.error('The machine facts failed.', error))
  const report = async (work: string, failure: unknown): Promise<void> => {
    const places = deps.places()
    const clean = redactFailure(failure, cleanWith(places))
    const body = issueBody(undefined, [failureStack(clean)], reportHead(await facts), places)
    const link = issueLink(ISSUE_URL, issueTitle(clean.name, clean.message ?? work, places), body)
    const answer = await vscode.window.showInformationMessage(PRIVACY, { modal: true }, OPEN_FORM)
    if (answer !== OPEN_FORM) return
    if (!link.prefilled) {
      await vscode.env.clipboard.writeText(body)
      vscode.window.showInformationMessage(LONG_FORM)
    }
    // A string target reaches the browser as it is. A Uri target gets its query encoded again.
    await vscode.env.openExternal(link.url as unknown as vscode.Uri)
  }
  return [
    vscode.commands.registerCommand(
      'yreview.copyDiagnosticReport',
      // The command also gives the text back, so a test can read it without the clipboard.
      guard(deps.log, 'Copy Diagnostic Report', async () => {
        const text = reportText(reportFacts(await facts), deps.ring.recent(), deps.places())
        await vscode.env.clipboard.writeText(text)
        vscode.window.showInformationMessage(COPIED)
        return text
      }),
    ),
    vscode.commands.registerCommand('yreview.reportFailure', (work: string, failure: unknown) =>
      report(work, failure).catch((error: unknown) =>
        deps.log.error('The issue form failed.', error),
      ),
    ),
  ]
}
