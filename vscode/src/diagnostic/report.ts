import { redactText } from '../core/redact'
import type { Places } from '../log'
import { type AgentCommands, commandOf } from '../session/agentCommands'
import { type AgentId, agentOf, defaultCommand } from '../session/catalog'
import { LIMIT } from './sessionLog'
import { type SessionRecord, factLine, recordText } from './sessionRecord'

export const REPORT_TITLE = 'Yreview diagnostic report'

/** The versions of the machine and the editor. */
export interface MachineFacts {
  readonly extension: string
  readonly editor: string
  readonly host: string
  readonly os: string
  readonly node: string
  readonly git: string
  readonly languageModelTools: boolean
  readonly mcpProvider: boolean
}

/** The machine and the switches of the window, as plain values. */
export interface ReportFacts {
  readonly machine: MachineFacts
  readonly channel: boolean
  readonly sharing: string
  readonly sessionLocation: string
  readonly agent: string
  readonly agentCommand: CommandKind
  /** Only a count, so the report names no path of a root outside the workspace. */
  readonly outsideRoots: number
}

/** The report names only the kind of the command. A custom command can carry a password. */
export type CommandKind = 'custom' | 'default'

export const commandKind = (agent: AgentId | undefined, commands: AgentCommands): CommandKind =>
  agent !== undefined && commandOf(agent, commands) !== defaultCommand(agentOf(agent))
    ? 'custom'
    : 'default'

const state = (on: boolean): string => (on ? 'on' : 'off')

export const cleanWith =
  (places: Places) =>
  (text: string): string =>
    redactText(text, places.homes, places.projects, places.repositories)

export const reportHead = (machine: MachineFacts): string =>
  [
    REPORT_TITLE,
    factLine('extension', machine.extension),
    factLine('editor', machine.editor),
    factLine('host', machine.host),
    factLine('os', machine.os),
    factLine('node', machine.node),
    factLine('git', machine.git),
    factLine('lm tools', state(machine.languageModelTools)),
    factLine('mcp provider', state(machine.mcpProvider)),
  ].join('\n')

/** The whole report. The redaction runs once over the joined text, so one exit covers every field. */
export const reportText = (
  facts: ReportFacts,
  records: readonly SessionRecord[],
  places: Places,
): string =>
  cleanWith(places)(
    [
      reportHead(facts.machine),
      '',
      'Settings',
      factLine('channel', state(facts.channel)),
      factLine('sharing', facts.sharing),
      factLine('session window', facts.sessionLocation),
      factLine('agent', facts.agent),
      factLine('agent command', facts.agentCommand),
      factLine('outside roots', String(facts.outsideRoots)),
      '',
      `Records, newest first (${records.length} of ${LIMIT})`,
      records.length === 0 ? '  none' : records.map(recordText).join('\n\n'),
    ].join('\n'),
  )
