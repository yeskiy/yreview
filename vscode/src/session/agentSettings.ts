import * as vscode from 'vscode'

import { type AgentCommands, commandsOf } from './agentCommands'
import { type AgentId, parseAgent } from './catalog'

export type SessionLocation = 'panel' | 'editor'

export interface AgentSettings {
  readonly agent?: AgentId
  readonly storedAgent: string
  readonly commands: AgentCommands
  readonly autoStart: boolean
  readonly location: SessionLocation
}

const config = (): vscode.WorkspaceConfiguration => vscode.workspace.getConfiguration('yreview')

/** `agent` and `agentCommands` have machine scope, so `get` never reads a workspace value. */
export const readAgentSettings = (): AgentSettings => {
  const stored = config().get<string>('agent', '')
  return {
    agent: parseAgent(stored),
    storedAgent: stored,
    commands: commandsOf(config().get<unknown>('agentCommands')),
    autoStart: config().get<boolean>('autoStartSession', true),
    location: config().get<string>('sessionLocation') === 'editor' ? 'editor' : 'panel',
  }
}

export const saveAgent = (id: AgentId): Promise<void> =>
  Promise.resolve(config().update('agent', id, vscode.ConfigurationTarget.Global))

export const saveCommands = (commands: AgentCommands): Promise<void> =>
  Promise.resolve(config().update('agentCommands', commands, vscode.ConfigurationTarget.Global))
