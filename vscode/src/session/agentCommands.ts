import { kotlinTrim } from '../core/kotlinText'
import { type AgentId, agentOf, defaultCommand, parseAgent } from './catalog'

export type AgentCommands = Readonly<Partial<Record<AgentId, string>>>

/** The stored map without a key that this build does not know and without a value that is no text. */
export const commandsOf = (raw: unknown): AgentCommands =>
  raw !== null && typeof raw === 'object' && !Array.isArray(raw)
    ? Object.fromEntries(
        Object.entries(raw).filter(
          ([key, value]) => parseAgent(key) === key && typeof value === 'string',
        ),
      )
    : {}

/** A blank value gives the default command of that agent. */
export const commandOf = (id: AgentId, commands: AgentCommands): string => {
  const stored = kotlinTrim(commands[id] ?? '')
  return stored === '' ? defaultCommand(agentOf(id)) : stored
}

/** A blank value or the default removes the key, so a later default change reaches the user. */
export const withCommand = (commands: AgentCommands, id: AgentId, value: string): AgentCommands => {
  const trimmed = kotlinTrim(value)
  const rest = Object.fromEntries(Object.entries(commands).filter(([key]) => key !== id))
  return trimmed === '' || trimmed === defaultCommand(agentOf(id))
    ? rest
    : { ...rest, [id]: trimmed }
}
